// `/ops/logs` through the real store: the files and lines are RTK Query reads, a line's trace
// is its entry in `state.widgets.disclosures`, and the export is the `logExported` thunk
// (store/screens/operator.ts). `stubApi` is the operator API.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import type { LogFileMeta, LogLine, PlatformCapability } from '@endur/shared';
import { errorReply, renderWithProviders, stubApi, type StubCall } from '../../../test-utils.js';
import Logs from './index.js';

let held: PlatformCapability[] = [];
vi.mock('../../../lib/opsCapabilities.js', () => ({
  useOpsCan: () => (capability: PlatformCapability) => held.includes(capability),
}));

const FILE: LogFileMeta = {
  name: 'error-2026-11-26.log', stream: 'error', date: '2026-11-26', bytes: 2048, lines: 2,
  modifiedAt: '2026-11-26T10:00:00.000Z',
};
const LINES: LogLine[] = [
  { at: '2026-11-26T10:00:00.000Z', level: 50, msg: 'Request failed', status: 500, requestId: 'req-1',
    err: { type: 'Error', message: 'boom', stack: 'Error: boom\n    at handler (app.ts:1:1)' } },
  { at: '2026-11-26T09:00:00.000Z', level: 30, msg: 'Started' },
];

let calls: StubCall[] = [];
const server = (overrides: Parameters<typeof stubApi>[0] = {}) => {
  calls = stubApi({
    'GET /platform/logs': { body: { data: [FILE], meta: { dir: '/var/log/endur', enabled: true, retentionDays: 14, maxSizeMb: 10 } } },
    'GET /platform/logs/error-2026-11-26.log': { body: { data: LINES, page: { nextCursor: null, hasMore: false }, meta: {} } },
    'GET /platform/logs/error-2026-11-26.log/export*': {
      body: {},
      headers: { 'Content-Disposition': 'attachment; filename="error-2026-11-26.csv"', 'X-Log-Lines': '2' },
    },
    ...overrides,
  });
};

const mount = () =>
  renderWithProviders(
    <Routes>
      <Route path="/ops/logs" element={<Logs />} />
    </Routes>,
    { path: '/ops/logs' },
  );

beforeEach(() => {
  held = ['platform.logs.read', 'platform.logs.export'] as PlatformCapability[];
  server();
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() }));
});
afterEach(() => vi.unstubAllGlobals());

describe('operator logs — 72', () => {
  it('opens the error stream by itself, and shows a line\'s trace on request', async () => {
    mount();
    expect(await screen.findByText('Request failed')).toBeTruthy();
    expect(screen.queryByText(/at handler/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show trace' }));
    expect(screen.getByText(/at handler/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Hide trace' }));
    expect(screen.queryByText(/at handler/)).toBeNull();
  });

  it('exports in the chosen format and says what was saved', async () => {
    mount();
    await screen.findByText('Request failed');
    fireEvent.change(screen.getByLabelText('Export as'), { target: { value: 'csv' } });
    fireEvent.click(screen.getByRole('button', { name: 'Export this file' }));

    expect(await screen.findByText(/2 lines saved as error-2026-11-26.csv/)).toBeTruthy();
    const exported = calls.find((call) => call.path.includes('/export'));
    expect(exported?.path).toBe('/platform/logs/error-2026-11-26.log/export?format=csv');
  });

  it('says why an export was refused', async () => {
    server({ 'GET /platform/logs/error-2026-11-26.log/export*': errorReply(403, 'FORBIDDEN', 'Exports need platform.logs.export.') });
    mount();
    await screen.findByText('Request failed');
    fireEvent.click(screen.getByRole('button', { name: 'Export this file' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Exports need platform.logs.export.');
  });

  it('offers no export without the capability', async () => {
    held = ['platform.logs.read'] as PlatformCapability[];
    mount();
    await screen.findByText('Request failed');
    expect(screen.queryByRole('button', { name: 'Export this file' })).toBeNull();
  });

  it('a 403 on the list is the access screen', async () => {
    server({ 'GET /platform/logs': errorReply(403, 'FORBIDDEN', 'No.') });
    mount();
    expect(await screen.findByText('You do not have access to this')).toBeTruthy();
    await waitFor(() => expect(calls.some((call) => call.path.startsWith('/platform/logs/'))).toBe(false));
  });
});
