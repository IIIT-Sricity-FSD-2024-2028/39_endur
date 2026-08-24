// T-052 — /app/roles. 33, design_specs/design/04 §4.3.
//
// WHERE "ADJUSTABLE ROLE-BASED ACCESS" STOPS BEING A CLAIM. Two surfaces on one route: the
// ladder, whose ORDER derives every level, and the grid, which replaces what would otherwise
// be a configuration file nobody outside the team could read.
//
// It is also the most dangerous screen in the product, and the danger is not evenly spread:
// `grant.update` can leave an organisation nobody is able to administer, and there is no
// undo, because undo is a grid edit. Two guards exist for that and BOTH ARE ON THE SERVER
// (INV-003) — the lockout guard's `409` and INV-012's `403 WOULD_ESCALATE`. This page's job
// is to render their sentences where the administrator can act on them, never to
// pre-empt them: `33` is explicit that a cell is not greyed out on a guess, because a screen
// whose whole claim is that it explains its refusals cannot start hiding them.
import { useState } from 'react';
import { PageHeader } from '../../../components/layout/PageHeader.js';
import { useCan } from '../../../lib/capabilities.js';
import { useRoleLadder, usePowersGrid } from '../../../lib/roles.js';
import { useProfile } from '../../../lib/profile.js';
import { RoleLadder } from './RoleLadder.js';
import { PowersGrid } from './PowersGrid.js';

type Tab = 'roles' | 'powers';

export default function Roles(): JSX.Element {
  const can = useCan();
  const [tab, setTab] = useState<Tab>('roles');

  const ladder = useRoleLadder();
  const grid = usePowersGrid();
  // The reader's OWN roles, for the grid's self-lockout prompt. `useCan()` cannot answer
  // this: it reports capabilities, and the question here is which ROLE ROW is about to lose
  // one. `Position.roleId` exists for exactly this reader (T-052).
  const me = useProfile();
  const myRoleIds = (me.data?.positions ?? [])
    .map((position) => position.roleId)
    .filter((id): id is string => id !== null);

  // Usability, never enforcement (20 §6). The API returns only what the caller may see and
  // refuses what they may not do; this decides whether a control is worth rendering.
  const canEditRoles = can('role.update');
  const canReadGrid = can('grant.read');
  const canEditGrid = can('grant.update');

  return (
    <>
      <PageHeader
        title="Roles and powers"
        subtitle="What each role is called, where it sits, and exactly what it can do."
      />

      <div className="tabs" role="tablist" aria-label="Roles and powers">
        <button
          type="button"
          role="tab"
          id="tab-roles"
          aria-selected={tab === 'roles'}
          aria-controls="panel-roles"
          className={`tab${tab === 'roles' ? ' is-active' : ''}`}
          onClick={() => setTab('roles')}
        >
          Roles
        </button>
        {canReadGrid && (
          <button
            type="button"
            role="tab"
            id="tab-powers"
            aria-selected={tab === 'powers'}
            aria-controls="panel-powers"
            className={`tab${tab === 'powers' ? ' is-active' : ''}`}
            onClick={() => setTab('powers')}
          >
            Powers
          </button>
        )}
      </div>

      {tab === 'roles' ? (
        <section id="panel-roles" role="tabpanel" aria-labelledby="tab-roles">
          <RoleLadder ladder={ladder} editable={canEditRoles} />
        </section>
      ) : (
        <section id="panel-powers" role="tabpanel" aria-labelledby="tab-powers">
          {/* READ-ONLY RATHER THAN ABSENT without `grant.update` (33 § States). Somebody who
              can see the grid and not change it is better served by seeing what the rules
              ARE than by an empty screen that looks broken. */}
          <PowersGrid grid={grid} editable={canEditGrid} myRoleIds={myRoleIds} />
        </section>
      )}
    </>
  );
}
