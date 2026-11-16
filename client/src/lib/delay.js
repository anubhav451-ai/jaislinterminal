import { IST } from './time.js';

// Yahoo Finance data is ~15 minutes behind. Strategies must only use candles that were already finished AS THE
// DATA SOURCE KNOWS IT, so "now" is moved back by the delay while Yahoo is the source (0 for Angel One).
let delaySec = 0;
export const setDataDelay = (s) => {
  delaySec = s || 0;
};
export const getDataDelay = () => delaySec;
// "now" on the same clock as candle times (unix seconds + 5:30), minus the data delay
export const nowIST = () => Math.floor(Date.now() / 1000) + IST - delaySec;
