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

  const label = (
    <span style={{ color: STATUS_COLOR[event.status], cursor: event.status === 'error' ? 'pointer' : undefined }}>
      {STATUS_TEXT[event.status]}
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
