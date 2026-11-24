import { BadRequestException } from '@nestjs/common';
import { SettingsService } from './settings.service';

function make(values: Record<string, string> = {}, ga4Problem: string | null = null) {
  const store = new Map(Object.entries(values));
  const cfg = {
    get: (k: string) => store.get(k),
    source: (k: string) => (store.has(k) ? 'screen' : 'none'),
    set: jest.fn(async (k: string, v: string) => { store.set(k, v); }),
    clear: jest.fn(async (k: string) => { store.delete(k); }),
  };
  const ga4 = { reset: jest.fn(), problem: ga4Problem, configured: ga4Problem === null, get propertyId() { return store.get('GA4_PROPERTY_ID') ?? ''; } };
  return { svc: new SettingsService(cfg as never, ga4 as never), cfg, ga4 };
}
const goodKey = JSON.stringify({ type: 'service_account', client_email: 'reader@proj.iam.gserviceaccount.com', private_key: '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n' });

describe('SettingsService', () => {
  it('uses the Enosis Outsourcing name until one is set', () => {
    expect(make().svc.siteName()).toBe('Enosis Outsourcing');
    expect(make({ SITE_NAME: 'Enosis Solutions' }).svc.siteName()).toBe('Enosis Solutions');
  });

  it('saves a site name and tidies the address to its origin', async () => {
    const { svc, cfg } = make();
    const v = await svc.setSite({ name: ' Enosis Solutions ', url: 'enosissolutions.com/about?x=1' }, 'a@x.com');
    expect(cfg.set).toHaveBeenCalledWith('SITE_NAME', 'Enosis Solutions');
    expect(cfg.set).toHaveBeenCalledWith('SITE_URL', 'https://enosissolutions.com');
    expect(v.site).toEqual({ name: 'Enosis Solutions', url: 'https://enosissolutions.com' });
  });

  it('rejects an empty name and a bad address', async () => {
    const { svc } = make();
    await expect(svc.setSite({ name: '  ' }, 'a')).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.setSite({ name: 'X', url: 'not a url' }, 'a')).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.setSite({ name: 'X', url: 'javascript:alert(1)' }, 'a')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('validates the Clarity token and never returns it', async () => {
    const { svc } = make();
    await expect(svc.setClarity('short', 'a')).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.setClarity('has a space in it 123456', 'a')).rejects.toBeInstanceOf(BadRequestException);
    const v = await svc.setClarity('  abcdefghij1234567890  ', 'a');
    expect(v.clarity).toMatchObject({ configured: true, source: 'screen' });
    expect(JSON.stringify(v)).not.toContain('abcdefghij1234567890');
  });

  it('accepts a GA4 key file, keeps the service account email, resets the connection and never returns the key', async () => {
    const { svc, cfg, ga4 } = make();
    const v = await svc.setGa4({ propertyId: '490022412', keyJson: goodKey }, 'a');
    expect(cfg.set).toHaveBeenCalledWith('GA4_PROPERTY_ID', '490022412');
    expect(cfg.set).toHaveBeenCalledWith('GA4_CLIENT_EMAIL', 'reader@proj.iam.gserviceaccount.com');
    expect(ga4.reset).toHaveBeenCalled();
    expect(v.ga4.clientEmail).toBe('reader@proj.iam.gserviceaccount.com');
    expect(JSON.stringify(v)).not.toContain('PRIVATE KEY');
  });

  it('rejects files that are not service-account keys, and bad property IDs', async () => {
    const { svc } = make();
    await expect(svc.setGa4({ keyJson: 'not json' }, 'a')).rejects.toThrow(/not valid JSON/);
    await expect(svc.setGa4({ keyJson: JSON.stringify({ type: 'authorized_user' }) }, 'a')).rejects.toThrow(/service-account key/);
    await expect(svc.setGa4({ propertyId: 'abc' }, 'a')).rejects.toThrow(/number/);
    await expect(svc.setGa4({}, 'a')).rejects.toThrow(/property ID, a key file/);
  });

  it('checks the PageSpeed key and can remove saved values', async () => {
    const { svc, cfg, ga4 } = make({ PAGESPEED_API_KEY: 'x'.repeat(30) });
    await expect(svc.setPagespeed('bad key!', 'a')).rejects.toBeInstanceOf(BadRequestException);
    await svc.clearPagespeed('a');
    expect(cfg.clear).toHaveBeenCalledWith('PAGESPEED_API_KEY');
    await svc.clearGa4('a');
    expect(cfg.clear).toHaveBeenCalledWith('GA4_KEY_JSON');
    expect(ga4.reset).toHaveBeenCalled();
  });

  it('takes the Clarity project ID as a code, or from any address that holds it', async () => {
    const { svc, cfg } = make();
    expect((await svc.setClarityProject('rn41bqeja2', 'a')).clarity.projectId).toBe('rn41bqeja2');
    await svc.setClarityProject('https://clarity.microsoft.com/player/RN41BQEJA2/kbbg6k/ufxnm2/?ss=1&sd=2', 'a');
    expect(cfg.set).toHaveBeenLastCalledWith('CLARITY_PROJECT_ID', 'rn41bqeja2');
    await svc.setClarityProject('https://clarity.microsoft.com/projects/view/abc123def4/dashboard', 'a');
    expect(cfg.set).toHaveBeenLastCalledWith('CLARITY_PROJECT_ID', 'abc123def4');
  });

  it('rejects things that are not a project ID, and can remove it', async () => {
    const { svc, cfg } = make({ CLARITY_PROJECT_ID: 'rn41bqeja2' });
    for (const bad of ['', 'short', 'has space in it', 'https://evil.example/projects/view/rn41bqeja2', '<script>']) await expect(svc.setClarityProject(bad, 'a')).rejects.toBeInstanceOf(BadRequestException);
    await svc.clearClarityProject('a');
    expect(cfg.clear).toHaveBeenCalledWith('CLARITY_PROJECT_ID');
  });
});
