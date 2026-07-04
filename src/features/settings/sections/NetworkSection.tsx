/**
 * Network settings section — choose the Yjs sync transport.
 *
 * The saved choice is the default for every future session; "Use for this
 * session only" layers a temporary override on top without touching it (see
 * settingsStore.sessionNetworkTransportOverride). Either way the change takes
 * effect on the next reload/reconnect, since the transport is picked once at
 * bootstrap — hence the reload prompt after any change.
 */
import React, { useState } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select';
import { Button } from '@/shared/ui/button';
import { useSettingsStore } from '@/app/stores/settingsStore';
import type { NetworkTransport } from '@/infrastructure/networking/YjsNetworkFactory';
import { SettingRow } from '../components/SettingRow';
import styles from './NetworkSection.module.css';

const TRANSPORT_LABELS: Record<NetworkTransport, string> = {
  websocket: 'WebSocket',
  webrtc: 'WebRTC',
};

export function NetworkSection() {
  const networkTransport = useSettingsStore((s) => s.networkTransport);
  const setNetworkTransport = useSettingsStore((s) => s.setNetworkTransport);
  const sessionOverride = useSettingsStore((s) => s.sessionNetworkTransportOverride);
  const setSessionOverride = useSettingsStore((s) => s.setSessionNetworkTransportOverride);

  const [pending, setPending] = useState<NetworkTransport>(sessionOverride ?? networkTransport);
  const [changed, setChanged] = useState(false);

  const effective = sessionOverride ?? networkTransport;

  return (
    <div className={styles.section}>
      <p className={styles.sectionTitle}>Connection</p>
      <SettingRow
        label="Network transport"
        description="How your game syncs with other players. If you're seeing connection errors, try switching this."
      >
        <Select
          value={pending}
          onValueChange={(value) => { setPending(value as NetworkTransport); setChanged(true); }}
        >
          <SelectTrigger aria-label="Network transport" size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="websocket">{TRANSPORT_LABELS.websocket}</SelectItem>
            <SelectItem value="webrtc">{TRANSPORT_LABELS.webrtc}</SelectItem>
          </SelectContent>
        </Select>
      </SettingRow>

      {changed && pending !== effective && (
        <div className={styles.actions}>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => { setSessionOverride(pending); setChanged(false); }}
          >
            Use for this session
          </Button>
          <Button
            size="sm"
            onClick={() => { setNetworkTransport(pending); setSessionOverride(null); setChanged(false); }}
          >
            Save as default
          </Button>
        </div>
      )}

      <p className={styles.hint}>
        Currently connected using <strong>{TRANSPORT_LABELS[effective]}</strong>
        {sessionOverride && ' (this session only)'}. Changes apply the next time you reload.
      </p>

      <div className={styles.actions}>
        <Button size="sm" variant="outline" onClick={() => window.location.reload()}>
          Reload now
        </Button>
      </div>
    </div>
  );
}
