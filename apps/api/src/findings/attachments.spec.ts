import { detectImage } from './attachments';

describe('detectImage', () => {
  it('detects png, jpeg and webp by content', () => {
    expect(detectImage(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))?.mime).toBe('image/png');
    expect(detectImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))?.ext).toBe('jpg');
    const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.from([1, 2, 3, 4]), Buffer.from('WEBP')]);
    expect(detectImage(webp)?.mime).toBe('image/webp');
  });

  it('rejects html, svg and empty files', () => {
    expect(detectImage(Buffer.from('<html><script>alert(1)</script>'))).toBeNull();
    expect(detectImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
    expect(detectImage(Buffer.alloc(0))).toBeNull();
  });
});
