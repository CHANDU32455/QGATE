(async () => {
  const { getRandomBytes } = require('../backend/qrng');

  console.log('Testing QRNG (64 bytes) with configured provider');
  try {
    const r = await getRandomBytes(64);
    console.log('Source:', r.source, 'Length:', r.bytes.length);
    console.log('Sample (base64):', r.bytes.toString('base64').slice(0, 40) + '...');
  } catch (e) {
    console.error('QRNG test failed:', e.message);
  }

  console.log('\nTesting QRNG fallback (force QRNG disabled)');
  process.env.QRNG_ENABLED = 'false';
  const r2 = await getRandomBytes(32);
  console.log('Source:', r2.source, 'Length:', r2.bytes.length);
  console.log('Sample (hex):', r2.bytes.toString('hex').slice(0, 40) + '...');
})();