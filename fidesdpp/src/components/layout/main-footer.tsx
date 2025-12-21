'use client';

import { NetworkSelection } from '@/components/shared/network-selection';
import { GithubSvgIcon } from '@/components/shared/icons';

export function MainFooter() {
  return (
    <div className='border-t border-gray-200 dark:border-gray-800'>
      <div className='max-w-5xl px-4 mx-auto flex justify-between items-center gap-4 py-4'>
        <div className='flex items-center gap-4'>
          <div className='text-sm text-muted-foreground'>
            Fides DPP Platform
          </div>
          <a
            href='https://github.com/gv70/FIDES-DPP'
            target='_blank'
            rel='noopener noreferrer'
            className='text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors'>
            <GithubSvgIcon />
          </a>
        </div>
        <NetworkSelection />
      </div>
    </div>
  );
}
