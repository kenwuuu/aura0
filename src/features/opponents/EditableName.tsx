import React, { useState, useEffect } from 'react';
import ContentEditable from 'react-contenteditable';

interface EditableNameProps {
  name: string;
  className?: string;
  onRename: (name: string) => void;
}

export const EditableName: React.FC<EditableNameProps> = ({
                                                            name,
                                                            className,
                                                            onRename,
                                                          }) => {
  const [editableName, setEditableName] = useState(name);

  useEffect(() => {
    // keep synced with parent (authoritative Yjs value)
    setEditableName(name);
  }, [name]);

  const handleChange = (e: any) => {
    setEditableName(e.target.value);
  };

  const handleBlur = (e: any) => {
    const text = (e.target.innerText ?? '').trim();

    if (text.length > 0 && text !== name) {
      onRename(text);
    }

    // reset to authoritative value; the Yjs update will flow back through props
    setEditableName(name);
  };

  return (
    <ContentEditable
      className={className}
      title="Click to rename"
      html={editableName}
      onChange={handleChange}
      onBlur={handleBlur}
      onKeyDown={(e: React.KeyboardEvent<HTMLElement>) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          (e.target as HTMLElement).blur();
        }
      }}
      tagName="div"
    />
  );
};
