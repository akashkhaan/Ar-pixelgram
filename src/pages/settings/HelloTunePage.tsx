import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { HelloTuneSettings } from '@/components/chat/HelloTuneSettings';
import { useAuth } from '@/contexts/AuthContext';
import { getHelloTuneFromProfile, type HelloTuneRecord } from '@/services/helloTunes';

const HelloTunePage: React.FC = () => {
  const navigate = useNavigate();
  const { user, profile, refreshProfile } = useAuth();
  const [tune, setTune] = useState<HelloTuneRecord | null>(() => getHelloTuneFromProfile(profile as any));
  useEffect(() => { setTune(getHelloTuneFromProfile(profile as any)); }, [profile]);
  return (
    <HelloTuneSettings
      isOpen
      onClose={() => navigate(-1)}
      userId={user?.id || ''}
      currentTune={tune}
      onSaved={t => { setTune(t); refreshProfile?.(); }}
    />
  );
};

export default HelloTunePage;
