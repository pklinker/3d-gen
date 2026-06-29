import { groupedTree, getArtifact } from "../artifacts/registry";
import type { ArtifactCategory, ArtifactType } from "../types";

interface Props {
  currentType: ArtifactType;
  onSelectType: (t: ArtifactType) => void;
}

export default function ArtifactTree({ currentType, onSelectType }: Props) {
  const currentCategory = getArtifact(currentType).category;
  const tree = groupedTree();

  return (
    <div className="artifact-tree">
      {tree.map(({ category, groups }) => {
        const isOpen = category.id === currentCategory;
        const firstLeaf = groups.flatMap((g) => g.artifacts)[0];
        return (
          <div key={category.id}>
            <button
              className={`tree-cat-header${isOpen ? " open" : ""}`}
              onClick={() => { if (!isOpen && firstLeaf) onSelectType(firstLeaf.type); }}
              aria-expanded={isOpen}
            >
              <span className="tree-chevron">▶</span>
              {category.label}
            </button>
            {isOpen && (
              <div className="tree-leaves">
                {groups.map(({ subcategory, artifacts }) =>
                  subcategory ? (
                    <div key={subcategory.id} className="tree-subgroup">
                      <div className="tree-subcat-header">{subcategory.label}</div>
                      {artifacts.map((a) => (
                        <button
                          key={a.type}
                          className={`tree-leaf${a.type === currentType ? " active" : ""}`}
                          onClick={() => onSelectType(a.type)}
                        >
                          {a.label}
                        </button>
                      ))}
                    </div>
                  ) : (
                    artifacts.map((a) => (
                      <button
                        key={a.type}
                        className={`tree-leaf${a.type === currentType ? " active" : ""}`}
                        onClick={() => onSelectType(a.type)}
                      >
                        {a.label}
                      </button>
                    ))
                  )
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
