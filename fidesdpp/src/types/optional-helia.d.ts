declare module 'helia' {
  export const createHelia: (...args: any[]) => Promise<any>;
}

declare module '@helia/json' {
  export const json: (helia: any) => any;
}

declare module '@helia/unixfs' {
  export const unixfs: (helia: any) => any;
}

declare module 'multiformats/cid' {
  export const CID: any;
}
