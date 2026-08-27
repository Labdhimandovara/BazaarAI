import { runLocalFallback } from '../src/services/intent';
describe('Source Override Regression Tests', () => {
  it('EBAY selection searches eBay without requiring on ebay', () => {
    const res = runLocalFallback('Find me headphones (Search only EBAY)', []);
    expect(res.extractedIntent!.sourcePreference).toBe('eBay');
    expect(res.extractedIntent!.query).toBe('headphones');
  });
  it('BAZAAR PRODUCTS selection searches Bazaar only', () => {
    const res = runLocalFallback('Find me chess (Search only synthetic/Razorpay merchants)', []);
    expect(res.extractedIntent!.sourcePreference).toBe('synthetic');
    expect(res.extractedIntent!.query).toBe('chess');
  });
  it('Explicit on eBay overrides ALL SOURCES', () => {
    const res = runLocalFallback('Find me headphones on eBay', []);
    expect(res.extractedIntent!.sourcePreference).toBe('eBay');
    expect(res.extractedIntent!.query).toBe('headphones');
  });
  it('Memory: eBay headphones cannot become chess', () => {
    const res = runLocalFallback('Find me a chess board', [{ role:'user', content:'Find me headphones (Search only EBAY)' }]);
    expect(res.extractedIntent!.sourcePreference).toBeNull();
    expect(res.extractedIntent!.query).toBe('chess board');
  });
});
