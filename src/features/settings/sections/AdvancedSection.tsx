/**
 * Advanced settings section — diagnostics and escape hatches, not preferences.
 *
 * Named for the shelf rather than its one occupant: "Network" described the
 * transport picker below, which meant every future troubleshooting control
 * (clear local room data, reset settings, copy debug info) would have needed
 * its own top-level section. Anything a normal player should never have to
 * touch belongs here.
 *
 * --- Network transport ---
 * "Automatic" (the default, null in settingsStore) defers to the
 * network-transport-websocket PostHog flag. Picking WebSocket or WebRTC here
 * saves an explicit override — permanently, or "for this session only" via
 * sessionNetworkTransportOverride. Either way the change takes effect on the
 * next reload/reconnect, since the transport is picked once at bootstrap —
 * hence the reload prompt after any change.
 *
 * This whole section only renders when network-transport-manual-override is
 * enabled (see SettingsModal) — that same flag also gates whether a saved
 * override is honored at bootstrap (getEffectiveNetworkTransport), so there's
 * no state a user can get stuck in that isn't visible/fixable here.
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
import { SettingGroup } from '../components/SettingGroup';
import styles from './AdvancedSection.module.css';

type TransportChoice = NetworkTransport | 'automatic';

const TRANSPORT_LABELS: Record<TransportChoice, string> = {
  automatic: 'Automatic',
  websocket: 'WebSocket',
  webrtc: 'WebRTC',
};

export function AdvancedSection() {
  const networkTransport = useSettingsStore((s) => s.networkTransport);
  const setNetworkTransport = useSettingsStore((s) => s.setNetworkTransport);
  const sessionOverride = useSettingsStore((s) => s.sessionNetworkTransportOverride);
  const setSessionOverride = useSettingsStore((s) => s.setSessionNetworkTransportOverride);

  const effective: TransportChoice = sessionOverride ?? networkTransport ?? 'automatic';
  const [pending, setPending] = useState<TransportChoice>(effective);
  const [changed, setChanged] = useState(false);

  const applyPending = (transport: TransportChoice): NetworkTransport | null =>
    transport === 'automatic' ? null : transport;

  return (
    <div>
      <SettingGroup title="Connection">
        <SettingRow
          label="Network transport"
          description="How your game syncs with other players. If you're seeing connection errors, try switching this."
        >
          <Select
            value={pending}
            onValueChange={(value) => { setPending(value as TransportChoice); setChanged(true); }}
          >
            <SelectTrigger aria-label="Network transport" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="automatic">{TRANSPORT_LABELS.automatic}</SelectItem>
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
              onClick={() => { setSessionOverride(applyPending(pending)); setChanged(false); }}
            >
              Use for this session
            </Button>
            <Button
              size="sm"
              onClick={() => { setNetworkTransport(applyPending(pending)); setSessionOverride(null); setChanged(false); }}
            >
              Save as default
            </Button>
          </div>
        )}

        <p className={styles.hint}>
          {effective === 'automatic'
            ? 'No manual override — the PostHog rollout flag decides.'
            : <>Currently set to <strong>{TRANSPORT_LABELS[effective]}</strong>{sessionOverride && ' (this session only)'}.</>}
          {' '}Changes apply the next time you reload.
        </p>

        <div className={styles.actions}>
          <Button size="sm" variant="outline" onClick={() => window.location.reload()}>
            Reload now
          </Button>
        </div>
      </SettingGroup>
    </div>
  );
}
