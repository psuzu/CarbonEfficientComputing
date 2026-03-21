import pandas as pd

df = pd.read_csv("data/hourly_marginal_emissions.csv")

df["datetime"] = pd.to_datetime(df["datetime"])
df = df.sort_values("datetime")
df = df.set_index("datetime").resample("1h").interpolate()

df["carbon_signal_gco2_per_kwh"] = df["marginal_co2_rate"] * 0.453592

df = df.reset_index().iloc[:48].copy()
df["hour_index"] = range(48)
df["signal_type"] = "marginal_proxy"

signal = df[["hour_index", "datetime", "carbon_signal_gco2_per_kwh", "signal_type"]]
signal.to_csv("carbon_signal_48h.csv", index=False)