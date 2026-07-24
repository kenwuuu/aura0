/**
 * A titled group of setting rows.
 *
 * Pairs with SettingRow: a section is a list of groups, a group is a list of
 * rows, and neither the section nor the row owns any layout CSS. Before this
 * existed every section hand-rolled the same `.section` / `.sectionTitle`
 * pair, so each new category meant another copy of the same stylesheet.
 *
 * The title is a real heading rather than the styled <p> it replaced — the
 * settings panel had no heading structure at all for screen readers.
 */
import React from 'react';
import styles from './SettingGroup.module.css';

interface SettingGroupProps {
  title: string;
  children: React.ReactNode;
}

export function SettingGroup({ title, children }: SettingGroupProps) {
  return (
    <section className={styles.group}>
      <h3 className={styles.title}>{title}</h3>
      {children}
    </section>
  );
}
