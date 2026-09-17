import { describe, it, expect } from 'vitest';
import { handleFoilRedeem } from './foilCodes';

const CODES = new Set(['FOIL-7X2QF']);

const redeem = (body: unknown, method = 'POST'): Promise<Response> =>
  handleFoilRedeem(
    new Request('https://aura0.app/api/foil-codes/redeem', {
      method,
      ...(method === 'POST' ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}),
    }),
    CODES,
  );

describe('handleFoilRedeem', () => {
  it('grants the style for a known code', async () => {
    const response = await redeem({ code: 'FOIL-7X2QF' });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ valid: true, style: 'nebula' });
  });

  it('accepts a code the player retyped in the wrong case, with stray spaces', async () => {
    // The code arrives by email and is typed back by hand or pasted with
    // whitespace. Rejecting those would read to the buyer as "you were not sent
    // a working code", which is the one impression this flow cannot afford.
    expect(await (await redeem({ code: '  foil-7x2qf  ' })).json()).toEqual({
      valid: true,
      style: 'nebula',
    });
  });

  it('answers an unknown code with 200 and valid: false', async () => {
    // Not an error status. "That code didn't work" and "the network failed"
    // send the player somewhere different, so they must not arrive alike.
    const response = await redeem({ code: 'FOIL-NOPE1' });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ valid: false });
  });

  it('never reveals the code list', async () => {
    // The entire reason this check is server-side rather than an array in the
    // bundle. A response that named the valid codes, counted them, or said which
    // one matched would hand back exactly what the Worker exists to withhold.
    const body = await (await redeem({ code: 'FOIL-NOPE1' })).text();

    expect(body).toBe(JSON.stringify({ valid: false }));
  });

  it('rejects a non-POST request', async () => {
    expect((await redeem(undefined, 'GET')).status).toBe(405);
  });

  it('rejects a body that is not JSON', async () => {
    expect((await redeem('not json at all')).status).toBe(400);
  });

  it('rejects a missing code', async () => {
    expect((await redeem({})).status).toBe(400);
  });

  it('rejects a blank code rather than matching on empty', async () => {
    expect((await redeem({ code: '   ' })).status).toBe(400);
  });

  it('rejects a non-string code', async () => {
    expect((await redeem({ code: 42 })).status).toBe(400);
  });
});
