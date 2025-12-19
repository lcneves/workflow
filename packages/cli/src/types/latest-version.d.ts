declare module 'latest-version' {
  interface Options {
    version?: string;
  }

  function latestVersion(
    packageName: string,
    options?: Options
  ): Promise<string>;

  export default latestVersion;
}
