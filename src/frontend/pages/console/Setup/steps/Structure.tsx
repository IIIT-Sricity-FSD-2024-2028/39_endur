import { useState } from 'react';
import { UnitTree } from '../../../../components/org/UnitTree.js';
import { Icon } from '../../../../components/Icon.js';
import { toTree, type UnitDraft } from '../useWizard.js';

export function StructureStep({
  units,
  unitWord,
  onRename,
  onAddChild,
  onDelete,
  onReparent,
}: {
  units: UnitDraft[];
  unitWord: string;
  onRename: (tempId: string, name: string) => void;
  onAddChild: (parentTempId: string) => string;
  onDelete: (tempId: string) => void;
  onReparent: (tempId: string, newParentTempId: string) => void;
}): JSX.Element {
  const [focusId, setFocusId] = useState<string | undefined>(undefined);
  const tree = toTree(units);
  const root = tree[0];
  const addLabel = `Add a ${unitWord}`;

  return (
    <div className="step">
      <h2 className="step-title">How is it organized?</h2>
      <p className="step-lede">Any depth you like. This is what scopes who sees what.</p>

      <div className="card tree-card">
        <UnitTree
          nodes={tree}
          mode="edit"
          addLabel={addLabel}
          focusId={focusId}
          onRename={onRename}
          onAddChild={(parentId) => setFocusId(onAddChild(parentId))}
          onDelete={onDelete}
          onReparent={onReparent}
        />

        {root && (
          <button
            type="button"
            className="btn btn-ghost tree-add"
            onClick={() => setFocusId(onAddChild(root.id))}
          >
            <Icon name="add" size={16} /> {addLabel}
          </button>
        )}
      </div>
    </div>
  );
}
