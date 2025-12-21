'use client';

import { useState, useEffect, useCallback } from 'react';
import { deployments, ContractId } from '@/contracts/deployments';

const STORAGE_KEY = 'fides-dpp-custom-contract-address';
const STORAGE_ENABLED_KEY = 'fides-dpp-use-custom-address';

/**
 * Hook to manage custom contract address with localStorage persistence
 * Falls back to default address from deployments.ts if not set
 */
export function useContractAddress() {
  const [customAddress, setCustomAddressState] = useState<string>('');
  const [useCustom, setUseCustomState] = useState<boolean>(false);

  // Load from localStorage on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const savedAddress = localStorage.getItem(STORAGE_KEY);
    const savedEnabled = localStorage.getItem(STORAGE_ENABLED_KEY);

    if (savedAddress) {
      setCustomAddressState(savedAddress);
    }
    if (savedEnabled === 'true') {
      setUseCustomState(true);
    }
  }, []);

  // Get default address from deployments
  const defaultAddress = deployments.find(d => d.id === ContractId.DPP_CONTRACT)?.address || '';

  // Get active address (custom if enabled, otherwise default)
  const activeAddress = useCustom && customAddress ? customAddress : defaultAddress;

  // Set custom address and save to localStorage
  const setCustomAddress = useCallback((address: string) => {
    setCustomAddressState(address);
    if (typeof window !== 'undefined') {
      if (address) {
        localStorage.setItem(STORAGE_KEY, address);
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  }, []);

  // Toggle use custom address and save to localStorage
  const setUseCustom = useCallback((enabled: boolean) => {
    setUseCustomState(enabled);
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_ENABLED_KEY, enabled ? 'true' : 'false');
      if (!enabled) {
        // Optionally clear address when disabled
        // localStorage.removeItem(STORAGE_KEY);
      }
    }
  }, []);

  // Clear custom address
  const clearCustomAddress = useCallback(() => {
    setCustomAddressState('');
    setUseCustomState(false);
    if (typeof window !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(STORAGE_ENABLED_KEY);
    }
  }, []);

  return {
    customAddress,
    useCustom,
    activeAddress,
    defaultAddress,
    setCustomAddress,
    setUseCustom,
    clearCustomAddress,
  };
}

