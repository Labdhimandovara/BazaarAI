import { runLocalFallback, classifyMessage } from '../src/services/intent';
describe('Conversational Intent Memory & eBay Edge Cases', () => {
  it('1. Classifies new request for headphones correctly', () => {
    const res = classifyMessage('on ebay I want headphones');
    expect(res).toBe('NEW_REQUEST');
  });
  it('2. Extracts correct core query without filler for new request', () => {
    const res = runLocalFallback('on ebay I want headphones');
    expect(res.extractedIntent?.query).toBe('headphones');
  });
  it('3. Retains source preference correctly', () => {
    const res = runLocalFallback('on ebay I want headphones');
    expect(res.extractedIntent?.sourcePreference).toBe('eBay');
  });
  it('4. Classifies pronoun as refinement', () => {
    const res = classifyMessage('can you find one under 5000');
    expect(res).toBe('REFINEMENT');
  });
  it('5. Inherits previous query on refinement', () => {
    const history = [{ role: 'user', content: 'on ebay I want headphones' }];
    const res = runLocalFallback('under 5000', history as any);
    expect(res.extractedIntent?.query).toBe('headphones');
    expect(res.extractedIntent?.maxBudgetPaise).toBe(500000);
  });
  it('6. Does not inherit previous query on new request', () => {
    const history = [{ role: 'user', content: 'Find me a chess board' }];
    const res = runLocalFallback('on ebay I want headphones', history as any);
    expect(res.extractedIntent?.query).toBe('headphones');
    expect(res.extractedIntent?.subcategory).not.toBe('chess');
  });
  it('7. Parses max delivery days properly', () => {
    const res = runLocalFallback('Find me a laptop within 3 days');
    expect(res.extractedIntent?.maxDeliveryDays).toBe(3);
  });
  it('8. Strips out multiple fillers', () => {
    const res = runLocalFallback('search ebay for a phone please');
    expect(res.extractedIntent?.query).toBe('phone');
  });
  it('9. Singular headphone is pluralized to headphones', () => {
    const res = runLocalFallback('i want a headphone');
    expect(res.extractedIntent?.query).toBe('headphones');
  });
  it('10. Missing intent context yields clarification', () => {
    const res = runLocalFallback('i want to buy something');
    expect(res.isComplete).toBe(false);
  });
});
