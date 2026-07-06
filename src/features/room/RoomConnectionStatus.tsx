import React, { useEffect, useState } from 'react';
import { NetworkStatusEvent, YjsNetworkProvider } from '@/infrastructure/networking/YjsNetworkFactory';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip';
import { useSettingsModalStore } from '@/app/stores/settingsModalStore';

interface ConnectionStatusProps {
  yjsNetworkProvider: YjsNetworkProvider,
}

const STATUS_TEXT: Record<NetworkStatusEvent['status'], string> = {
  connected: 'Connected',
  connecting: 'Waiting for players...',
  error: "Can't reach server",
};

const STATUS_COLOR: Record<NetworkStatusEvent['status'], string> = {
  connected: '#4ade80',
  connecting: '#facc15',
  error: '#f87171',
};

export const RoomConnectionStatus: React.FC<ConnectionStatusProps> = ({ yjsNetworkProvider }) => {
  const [event, setEvent] = useState<NetworkStatusEvent>({ status: 'connecting' });
  const openSettings = useSettingsModalStore((s) => s.open);

  useEffect(() => {
    const handleStatus = (next: NetworkStatusEvent) => setEvent(next);
    yjsNetworkProvider.on('status', handleStatus);
    return () => yjsNetworkProvider.off('status', handleStatus);
  }, [yjsNetworkProvider]);

  // The dot stays visible at every width; the text label collapses below the
  // `sm` breakpoint (see the "Toolbar responsive collapse" block in
  // style.css) so the status stays legible without needing the full phrase.
  const label = (
    <span
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: event.status === 'error' ? 'pointer' : undefined }}
      aria-label={STATUS_TEXT[event.status]}
    >
      <span
        aria-hidden="true"
        style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: STATUS_COLOR[event.status], flexShrink: 0 }}
      />
      <span className="toolbar-collapsible-text" style={{ color: STATUS_COLOR[event.status] }}>
        {STATUS_TEXT[event.status]}
      </span>
    </span>
  );

  if (event.status !== 'error') {
    return label;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={() => openSettings('network')}
          style={{ background: 'none', border: 'none', padding: 0, font: 'inherit' }}
          aria-label={`${event.message ?? 'Connection error'}. Click to open network settings.`}
        >
          {label}
        </button>
      </TooltipTrigger>
      <TooltipContent>
        {event.message} Click to open Settings.
      </TooltipContent>
    </Tooltip>
  );
}
