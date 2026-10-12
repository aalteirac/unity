const guidance = 'A locator alone cannot identify a private-listing recipient. Copy the Data Sharing Account Identifier (ORG.ACCOUNT) from Snowsight account details.';
export function normalizeAccount(raw: string): string {
  let input = raw.trim();
  if (!input || input.length > 512) throw new Error('Enter a Snowflake account URL or ORG.ACCOUNT identifier.');
  if (input.includes('://')) {
    let url: URL;
    try { url = new URL(input); } catch { throw new Error('Enter a valid HTTPS Snowflake URL.'); }
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash) throw new Error('Use a plain HTTPS Snowflake account URL without credentials, a port, query, or fragment.');
    if (url.hostname === 'app.snowflake.com') {
      const segments = url.pathname.split('/').filter(Boolean);
      if (segments.length < 2) throw new Error(guidance);
      input = `${segments[0]}.${segments[1]}`;
    } else if (url.hostname.endsWith('.snowflakecomputing.com') && (url.pathname === '/' || url.pathname === '')) {
      input = url.hostname.slice(0, -'.snowflakecomputing.com'.length);
      if (input.includes('.')) throw new Error(guidance);
      if (!input.includes('-')) throw new Error(guidance);
      input = input.replaceAll('-', '_').replace('_', '.');
    } else throw new Error('Use a recognized Snowflake account URL or the ORG.ACCOUNT identifier.');
  } else if (/^[a-z][a-z0-9]*-[a-z][a-z0-9_-]*$/i.test(input)) {
    input = input.replaceAll('-', '_').replace('_', '.');
  }
  if (!/^[a-z][a-z0-9]*\.[a-z][a-z0-9_]*$/i.test(input)) throw new Error(guidance);
  // Do not mistake a legacy locator plus region for an organization/account pair.
  if (/^[a-z]{2}\d+\./i.test(input)) throw new Error(guidance);
  if (input.length > 63 || input.endsWith('_')) throw new Error('The account identifier is too long or ends in an underscore.');
  return input.toUpperCase();
}