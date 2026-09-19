import { activeCallPersonIdState } from '@/calling/states/activeCallPersonIdState';
import { dialerNumberState } from '@/calling/states/dialerNumberState';
import { isDialerOpenState } from '@/calling/states/isDialerOpenState';
import { useAtomState } from '@/ui/utilities/state/jotai/hooks/useAtomState';

export const useOpenDialer = () => {
  const [, setIsDialerOpen] = useAtomState(isDialerOpenState);
  const [, setDialerNumber] = useAtomState(dialerNumberState);
  const [, setActiveCallPersonId] = useAtomState(activeCallPersonIdState);

  const openDialer = ({
    phoneNumber,
    personId,
  }: {
    phoneNumber?: string;
    personId?: string | null;
  } = {}) => {
    if (phoneNumber !== undefined) {
      setDialerNumber(phoneNumber);
    }

    setActiveCallPersonId(personId ?? null);
    setIsDialerOpen(true);
  };

  return { openDialer };
};
