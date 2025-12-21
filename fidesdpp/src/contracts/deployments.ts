import { ContractDeployment, westendAssetHub } from 'typink';
import dppContract from './artifacts/dpp_contract/dpp_contract.json';
import { CONTRACT_ADDRESS } from '@/lib/config';

export enum ContractId {
  DPP_CONTRACT = 'dpp_contract',
}

export const deployments: ContractDeployment[] = [
  {
    id: ContractId.DPP_CONTRACT,
    metadata: dppContract,
    network: westendAssetHub.id,
    address: CONTRACT_ADDRESS,
  },
];
