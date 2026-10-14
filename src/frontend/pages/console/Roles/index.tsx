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
  const me = useProfile();
  const myRoleIds = (me.data?.positions ?? [])
    .map((position) => position.roleId)
    .filter((id): id is string => id !== null);

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
        <section id="panel-roles" role="tabpanel" aria-labelledby="tab-roles" className="card roles-panel">
          <RoleLadder ladder={ladder} editable={canEditRoles} />
        </section>
      ) : (
        <section id="panel-powers" role="tabpanel" aria-labelledby="tab-powers" className="card roles-panel">
          {/* READ-ONLY RATHER THAN ABSENT without `grant.update` (33 § States). Somebody who
              can see the grid and not change it is better served by seeing what the rules
              ARE than by an empty screen that looks broken. */}
          <PowersGrid grid={grid} editable={canEditGrid} myRoleIds={myRoleIds} />
        </section>
      )}
    </>
  );
}
