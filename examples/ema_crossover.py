# Example strategy for the Strategy tab -> Add strategy -> Upload Python file
DESCRIPTION = "BUY when fast EMA crosses above slow EMA, SELL when it crosses below"
RULES = [
    "BUY on the candle where EMA(fast) closes above EMA(slow).",
    "SELL on the candle where EMA(fast) closes below EMA(slow).",
]
DEFAULTS = {"interval": "15m", "fast": 9, "slow": 21}   # every number here becomes an editable input
SIDE = "both"                                            # "buy", "sell" or "both"


def indicators(p):
    # lines drawn on the chart while this strategy is applied (optional)
    return [
        {"type": "ema", "params": {"period": p["fast"]}, "color": "#1a56db"},
        {"type": "ema", "params": {"period": p["slow"]}, "color": "#0b2a6f"},
    ]


def evaluate(candles, p):
    # candles: dict of lists -> time, open, high, low, close, volume (oldest first)
    close = candles["close"]
    fast = ta.ema(close, p["fast"])
    slow = ta.ema(close, p["slow"])
    return {"buy": ta.crossover(fast, slow), "sell": ta.crossunder(fast, slow)}
