// Step 3 — structure. 31 § Interactions, design_specs/design/03 §3.4.
//
// The button label comes from the DRAFT vocabulary, not from `useLabels()`: the org has
// not been saved yet, so the store still holds the old words. "Add a Department" here,
// "Add a Property" in the hotel org — INV-001 applies to a draft exactly as it applies to
// a saved org.
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
  /** The singular from step 4's draft labels, e.g. "Department". */
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
          // `+` adds a child under that row and focuses the new name input immediately.
          // Two clicks and two words — that is the demo beat, and anything slower shows.
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
