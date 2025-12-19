declare module 'update-check' {
  interface Package {
    name: string;
    version: string;
  }

  interface UpdateResult {
    latest: string;
  }

  interface Options {
    interval?: number;
    distTag?: string;
  }

  function updateCheck(
    pkg: Package,
    options?: Options
  ): Promise<UpdateResult | null>;

  export = updateCheck;
}
