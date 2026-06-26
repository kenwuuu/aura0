import React, { useState, useEffect } from 'react';

interface EditableNameProps {
  name: string;
  className?: string;
  onRename: (name: string) => void;
}

export const EditableName: React.FC<EditableNameProps> = ({ name, className, onRename }) => {
  const [value, setValue] = useState(name);

  useEffect(() => {
    setValue(name);
  }, [name]);

  const commit = (raw: string) => {
    const text = raw.trim();
    if (text.length > 0 && text !== name) {
      onRename(text);
    }
    setValue(name);
  };

  return (
    <input
      className={className}
      type="text"
      title="Click to rename"
      value={value}
      onChange={e => setValue(e.target.value)}
      onBlur={e => commit(e.target.value)}
      onKeyDown={e => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
    />
  );
};
