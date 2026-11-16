// Nifty 50 + Bank Nifty constituents. Index rebalances twice a year, so verify against
// https://www.niftyindices.com and edit this list if a stock was added/removed.
// [tradingSymbol, display name, yahooSymbol]
const RAW = [
  ['ADANIENT', 'Adani Enterprises', 'ADANIENT.NS'],
  ['ADANIPORTS', 'Adani Ports & SEZ', 'ADANIPORTS.NS'],
  ['APOLLOHOSP', 'Apollo Hospitals', 'APOLLOHOSP.NS'],
  ['ASIANPAINT', 'Asian Paints', 'ASIANPAINT.NS'],
  ['AXISBANK', 'Axis Bank', 'AXISBANK.NS'],
  ['BAJAJ-AUTO', 'Bajaj Auto', 'BAJAJ-AUTO.NS'],
  ['BAJFINANCE', 'Bajaj Finance', 'BAJFINANCE.NS'],
  ['BAJAJFINSV', 'Bajaj Finserv', 'BAJAJFINSV.NS'],
  ['BEL', 'Bharat Electronics', 'BEL.NS'],
  ['BHARTIARTL', 'Bharti Airtel', 'BHARTIARTL.NS'],
  ['CIPLA', 'Cipla', 'CIPLA.NS'],
  ['COALINDIA', 'Coal India', 'COALINDIA.NS'],
  ['DRREDDY', "Dr. Reddy's Labs", 'DRREDDY.NS'],
  ['EICHERMOT', 'Eicher Motors', 'EICHERMOT.NS'],
  ['ETERNAL', 'Eternal (Zomato)', 'ETERNAL.NS'],
  ['GRASIM', 'Grasim Industries', 'GRASIM.NS'],
  ['HCLTECH', 'HCL Technologies', 'HCLTECH.NS'],
  ['HDFCBANK', 'HDFC Bank', 'HDFCBANK.NS'],
  ['HDFCLIFE', 'HDFC Life', 'HDFCLIFE.NS'],
  ['HINDALCO', 'Hindalco', 'HINDALCO.NS'],
  ['HINDUNILVR', 'Hindustan Unilever', 'HINDUNILVR.NS'],
  ['ICICIBANK', 'ICICI Bank', 'ICICIBANK.NS'],
  ['INDIGO', 'InterGlobe Aviation', 'INDIGO.NS'],
  ['INFY', 'Infosys', 'INFY.NS'],
  ['ITC', 'ITC', 'ITC.NS'],
  ['JIOFIN', 'Jio Financial', 'JIOFIN.NS'],
  ['JSWSTEEL', 'JSW Steel', 'JSWSTEEL.NS'],
  ['KOTAKBANK', 'Kotak Mahindra Bank', 'KOTAKBANK.NS'],
  ['LT', 'Larsen & Toubro', 'LT.NS'],
  ['M&M', 'Mahindra & Mahindra', 'M&M.NS'],
  ['MARUTI', 'Maruti Suzuki', 'MARUTI.NS'],
  ['MAXHEALTH', 'Max Healthcare', 'MAXHEALTH.NS'],
  ['NESTLEIND', 'Nestle India', 'NESTLEIND.NS'],
  ['NTPC', 'NTPC', 'NTPC.NS'],
  ['ONGC', 'ONGC', 'ONGC.NS'],
  ['POWERGRID', 'Power Grid', 'POWERGRID.NS'],
  ['RELIANCE', 'Reliance Industries', 'RELIANCE.NS'],
  ['SBILIFE', 'SBI Life Insurance', 'SBILIFE.NS'],
  ['SBIN', 'State Bank of India', 'SBIN.NS'],
  ['SHRIRAMFIN', 'Shriram Finance', 'SHRIRAMFIN.NS'],
  ['SUNPHARMA', 'Sun Pharma', 'SUNPHARMA.NS'],
  ['TATACONSUM', 'Tata Consumer', 'TATACONSUM.NS'],
  ['TMPV', 'Tata Motors (PV)', 'TMPV.NS'],
  ['TATASTEEL', 'Tata Steel', 'TATASTEEL.NS'],
  ['TCS', 'TCS', 'TCS.NS'],
  ['TECHM', 'Tech Mahindra', 'TECHM.NS'],
  ['TITAN', 'Titan Company', 'TITAN.NS'],
  ['TRENT', 'Trent', 'TRENT.NS'],
  ['ULTRACEMCO', 'UltraTech Cement', 'ULTRACEMCO.NS'],
  ['WIPRO', 'Wipro', 'WIPRO.NS'],
];

// Bank Nifty has 12 stocks; 5 are already in Nifty 50, these 7 are extra.
const BANK_EXTRA = [
  ['INDUSINDBK', 'IndusInd Bank'],
  ['BANKBARODA', 'Bank of Baroda'],
  ['PNB', 'Punjab National Bank'],
  ['CANBK', 'Canara Bank'],
  ['FEDERALBNK', 'Federal Bank'],
  ['IDFCFIRSTB', 'IDFC First Bank'],
  ['AUBANK', 'AU Small Finance Bank'],
];
const BANK = new Set(['HDFCBANK', 'ICICIBANK', 'SBIN', 'KOTAKBANK', 'AXISBANK', ...BANK_EXTRA.map((b) => b[0])]);
const NIFTY = new Set(RAW.map((r) => r[0]));

export const INDICES = [
  { symbol: 'NIFTY50', name: 'NIFTY 50', yahoo: '^NSEI', angel: { symbol: 'Nifty 50', token: '99926000' }, index: true, groups: ['index'] },
  { symbol: 'BANKNIFTY', name: 'NIFTY BANK', yahoo: '^NSEBANK', angel: { symbol: 'Nifty Bank', token: '99926009' }, index: true, groups: ['index'] },
];

const stocks = [...RAW.map(([symbol, name, yahoo]) => [symbol, name, yahoo]), ...BANK_EXTRA.map(([symbol, name]) => [symbol, name, `${symbol}.NS`])];

export const SYMBOLS = [
  ...INDICES,
  ...stocks.map(([symbol, name, yahoo]) => ({
    symbol,
    name,
    yahoo,
    angel: { symbol: `${symbol}-EQ` },
    index: false,
    groups: [...(NIFTY.has(symbol) ? ['nifty50'] : []), ...(BANK.has(symbol) ? ['banknifty'] : [])],
  })),
];

export const BY_SYMBOL = Object.fromEntries(SYMBOLS.map((s) => [s.symbol, s]));
