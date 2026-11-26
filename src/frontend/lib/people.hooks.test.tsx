// R-404: the people hooks on RTK Query, run for real over a stubbed `fetch`. The People
// pages' own tests mock these hooks; this is what runs underneath.
import { act, renderHook, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Page, PersonDetail, PersonSummary } from '@endur/shared';
import { setupStore, type AppStore } from '../store/index.js';
import { meFixture, stubApi, type StubCall } from '../test-utils.js';
import { useBootSession } from './session.js';
import { usePeopleList, usePeopleSearch, usePerson } from './people.js';
import {
  importCommitted,
  importFileRead,
  importKey,
  importOpened,
  personRenamed,
  positionAdded,
} from '../store/screens/people.js';

const person = (id: string, name: string): PersonSummary =>
  ({ id, name, email: null, positions: [] } as unknown as PersonSummary);
const page = (...rows: PersonSummary[]): { body: Page<PersonSummary> } =>
  ({ body: { data: rows, page: { nextCursor: null, hasMore: false }, meta: { total: rows.length } } });
const detail = (id: string, name: string, roles: string[] = []) =>
  ({ body: { data: { id, name, positions: roles.map((roleName) => ({ roleName })) } as unknown as PersonDetail } });

function render<T>(hook: () => T, store: AppStore = setupStore()) {
  const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>;
  return { ...renderHook(hook, { wrapper }), store };
}

const count = (calls: StubCall[], method: string, path: string) =>
  calls.filter((call) => call.method === method && call.path === path).length;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('usePerson', () => {
  it('a new position re-reads the person AND /auth/me: it is a permission change', async () => {
    let roles: string[] = [];
    const calls = stubApi({
      'GET /auth/me': { body: meFixture() },
      'GET /people/p1': () => detail('p1', 'Amara Rao', roles),
      'POST /people/p1/assignments': () => {
        roles = ['Tutor'];
        return { status: 201, body: { data: person('p1', 'Amara Rao') } };
      },
    });
    const { result, store } = render(() => {
      useBootSession();
      return usePerson('p1');
    });
    await waitFor(() => expect(result.current.data?.name).toBe('Amara Rao'));
    await waitFor(() => expect(count(calls, 'GET', '/auth/me')).toBe(1));

    // The page's command: a thunk over the assign mutation (store/screens/people.ts).
    await act(async () => {
      await store.dispatch(positionAdded({ personId: 'p1', body: { unitId: 'u1', roleId: 'r2' } as never, from: 'page' }));
    });
    await waitFor(() => expect(result.current.data?.positions).toHaveLength(1));

    // Resolved with the powers as the server worked them out, not a chip beside old ones.
    expect(result.current.data?.positions).toHaveLength(1);
    // Placing yourself changes your own nav; the shell's /auth/me follows.
    await waitFor(() => expect(count(calls, 'GET', '/auth/me')).toBe(2));
  });

  it('moving to another person never shows the last one\'s record while it loads', async () => {
    stubApi({ 'GET /people/p1': detail('p1', 'Amara'), 'GET /people/p2': detail('p2', 'Bilal') });
    const store = setupStore();
    const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>;
    const { result, rerender } = renderHook(({ id }: { id: string }) => usePerson(id), {
      wrapper,
      initialProps: { id: 'p1' },
    });
    await waitFor(() => expect(result.current.data?.name).toBe('Amara'));

    rerender({ id: 'p2' });
    expect(result.current.data).toBeNull();
    await waitFor(() => expect(result.current.data?.name).toBe('Bilal'));
  });
});

describe('usePeopleList', () => {
  it('an edit re-reads exactly the lists that show that person, and resolves after', async () => {
    let name = 'Amara';
    const calls = stubApi({
      'GET /people': () => page(person('p1', name), person('p2', 'Bilal')),
      'GET /people?roleId=r9': page(person('p3', 'Chen')),
      'PATCH /people/p1': () => {
        name = 'Amara Rao';
        return { body: { data: person('p1', name) } };
      },
    });
    const { result, store } = render(() => ({ all: usePeopleList({}), tutors: usePeopleList({ roleId: 'r9' }) }));
    await waitFor(() => expect(result.current.all.data?.data).toHaveLength(2));
    await waitFor(() => expect(result.current.tutors.data?.data).toHaveLength(1));

    await act(async () => {
      await store.dispatch(personRenamed({ personId: 'p1', name: 'Amara Rao', from: 'list' }));
    });

    await waitFor(() => expect(result.current.all.data?.data[0]?.name).toBe('Amara Rao'));
    expect(count(calls, 'GET', '/people')).toBe(2);
    // p1 is not on the tutors page, so it is not asked again.
    expect(count(calls, 'GET', '/people?roleId=r9')).toBe(1);
  });
});

describe('usePeopleSearch', () => {
  it('asks nothing under two characters, and never shows the last term\'s matches', async () => {
    const calls = stubApi({
      'GET /people?q=am&limit=6': page(person('p1', 'Amara')),
      'GET /people?q=bi&limit=6': page(person('p2', 'Bilal')),
    });
    const store = setupStore();
    const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>;
    const { result, rerender } = renderHook(({ term }: { term: string }) => usePeopleSearch(term), {
      wrapper,
      initialProps: { term: 'a' },
    });
    expect(result.current).toEqual({ data: null, loading: false, error: null });
    expect(calls).toHaveLength(0);

    rerender({ term: 'am' });
    await waitFor(() => expect(result.current.data?.data[0]?.name).toBe('Amara'));

    rerender({ term: 'bi' });
    // A wrong match here would link one person's review to another's record (35).
    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.data?.data[0]?.name).toBe('Bilal'));
  });
});

describe('the CSV import (store/screens/people.ts)', () => {
  it('previews, then commits with the file\'s key, and the directory behind it catches up', async () => {
    let imported = false;
    const calls = stubApi({
      'GET /people': () => (imported ? page(person('p1', 'Amara'), person('p2', 'Bilal')) : page(person('p1', 'Amara'))),
      'POST /people/import/preview': {
        body: { data: { columns: ['name', 'email'], sample: [], rowCount: 1, unmatchedRoles: [], unmatchedUnits: [], existingEmails: [] } },
      },
      'POST /people/import': () => {
        imported = true;
        return { body: { data: { created: 1, updated: 0, assigned: 0, skipped: [] } } };
      },
    });
    const { result, store } = render(() => usePeopleList({}));
    await waitFor(() => expect(result.current.data?.data).toHaveLength(1));

    const csv = 'name,email\nBilal,bilal@example.test';
    store.dispatch(importOpened());
    // The File is the thunk's argument; only its text reaches the store.
    await act(async () => { await store.dispatch(importFileRead(new File([csv], 'people.csv'))); });
    expect(store.getState().people?.import).toMatchObject({ step: 'review', csv });

    await act(async () => { await store.dispatch(importCommitted()); });

    const commit = calls.find((call) => call.path === '/people/import');
    expect(commit?.headers.get('Idempotency-Key')).toBe(importKey(csv));
    expect(commit?.body).toMatchObject({ rows: [{ name: 'Bilal', email: 'bilal@example.test' }] });
    expect(store.getState().people?.import?.step).toBe('done');
    await waitFor(() => expect(result.current.data?.data).toHaveLength(2));
  });

  it('says why a file could not be read, beside the picker, and nothing else happens', async () => {
    stubApi({
      'POST /people/import/preview': { status: 422, body: { error: { code: 'VALIDATION_FAILED', message: 'That file has no email column.', requestId: 'r' } } },
    });
    const store = setupStore();
    store.dispatch(importOpened());
    await act(async () => { await store.dispatch(importFileRead(new File(['name\nBilal'], 'p.csv'))); });
    expect(store.getState().people?.import).toMatchObject({ step: 'pick', readError: 'That file has no email column.' });
  });
});
