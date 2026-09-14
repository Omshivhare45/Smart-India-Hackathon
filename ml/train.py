"""
Training pipeline — trains 4 model configurations from 2 algorithms
(RandomForest A/B and XGBoost A/B), evaluates them with MAE / RMSE / R2,
auto-selects the best config by MAE (primary) then RMSE, and builds a weighted
ensemble of the top performers.

Artifacts written to `ml/artifacts/`:
  - preprocessor.joblib      ColumnTransformer (numeric scaler + one-hot)
  - rf_a.joblib / rf_b.joblib / xgb_a.joblib / xgb_b.joblib
  - ensemble.joblib
  - model_meta.json          features, metrics, best model, data provenance
  - feature_columns.json     feature list in pipeline order
  - train_history.json       timestamped comparison table
"""

from __future__ import annotations

import json
import time
from datetime import datetime

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from xgboost import XGBRegressor

from ml import config as cfg
from ml.data_loader import load_raw, temporal_split
from ml.features import build_features


def _metrics(y_true, y_pred) -> dict:
    y_true = np.asarray(y_true).ravel()
    y_pred = np.asarray(y_pred).ravel()
    mae = float(mean_absolute_error(y_true, y_pred))
    rmse = float(np.sqrt(mean_squared_error(y_true, y_pred)))
    r2 = float(r2_score(y_true, y_pred))
    acc10 = float(np.mean(np.abs(y_pred - y_true) <= 10.0))
    return {"mae": round(mae, 3), "rmse": round(rmse, 3), "r2": round(r2, 4), "acc10": round(acc10, 4)}


def build_preprocessor():
    numeric = Pipeline([("imputer", SimpleImputer(strategy="median")), ("scaler", StandardScaler())])
    categorical = Pipeline([("onehot", OneHotEncoder(handle_unknown="ignore"))])
    return ColumnTransformer(
        transformers=[
            ("num", numeric, cfg.NUMERIC_FEATURES),
            ("cat", categorical, cfg.CATEGORICAL_FEATURES),
        ]
    )


# 4 model configurations from 2 algorithms. RandomForest uses per-tree
# max_samples subsampling: with ~1.1M training rows and ~6k one-hot columns this
# keeps bagging the dominant cost while retaining a high-quality forest.
#  - RandomForest-A: balanced, depth-bounded forest
#  - RandomForest-B: deeper forest with stronger leaf/split regularisation
#  - XGBoost-A:     standard-depth boosted trees
#  - XGBoost-B:     shallow, conservative boosted trees (lower lr, more trees)
MODELS = {
    "RandomForest-A": lambda: RandomForestRegressor(
        n_estimators=120, max_depth=16, min_samples_leaf=2,
        max_samples=200000, n_jobs=cfg.N_JOBS, random_state=cfg.RANDOM_STATE,
    ),
    "RandomForest-B": lambda: RandomForestRegressor(
        n_estimators=150, max_depth=None, min_samples_leaf=5,
        min_samples_split=10, max_samples=200000, n_jobs=cfg.N_JOBS,
        random_state=cfg.RANDOM_STATE,
    ),
    "XGBoost-A": lambda: XGBRegressor(
        n_estimators=250, max_depth=8, learning_rate=0.08,
        subsample=0.9, colsample_bytree=0.9,
        n_jobs=cfg.N_JOBS, random_state=cfg.RANDOM_STATE,
        verbosity=0, eval_metric="mae",
    ),
    "XGBoost-B": lambda: XGBRegressor(
        n_estimators=600, max_depth=4, learning_rate=0.03,
        subsample=0.8, colsample_bytree=0.7, reg_lambda=1.0,
        n_jobs=cfg.N_JOBS, random_state=cfg.RANDOM_STATE,
        verbosity=0, eval_metric="mae",
    ),
}


def _score_all(fitted, X, y) -> dict[str, dict]:
    scores = {}
    for name, pipe in fitted.items():
        scores[name] = _metrics(y, pipe.predict(X))
    return scores


def _select_best(scores: dict[str, dict]) -> str:
    """Best model by MAE, tie-broken by RMSE."""
    return min(scores, key=lambda n: (scores[n]["mae"], scores[n]["rmse"]))


def _ensemble_weights(scores: dict[str, dict]) -> dict[str, float]:
    """Inverse-MAE weights over the top-3 models, normalised to sum 1."""
    ranked = sorted(scores.items(), key=lambda kv: (kv[1]["mae"], kv[1]["rmse"]))[:3]
    mae_list = [s["mae"] for _, s in ranked]
    inv = [1.0 / (m + 1e-6) for m in mae_list]
    total = sum(inv)
    return {name: w / total for name, w in zip([n for n, _ in ranked], inv)}


def run_training():
    cfg.ensure_dirs()
    raw, source_used = load_raw()
    train_mask, test_mask = temporal_split(raw)

    train_df = raw[train_mask].reset_index(drop=True)
    test_df = raw[test_mask].reset_index(drop=True)

    def prepare(Xdf):
        feats = build_features(Xdf, train_hist=train_df)
        X_ = feats[cfg.NUMERIC_FEATURES + cfg.CATEGORICAL_FEATURES]
        y_ = feats[cfg.TARGET].clip(lower=0)
        return X_, y_

    # historical features fitted on TRAIN only, applied to both partitions
    X_train, y_train = prepare(train_df)
    X_test, y_test = prepare(test_df)

    # Final "validation" split inside train for model selection
    val_rows = int(len(X_train) * (1 - cfg.VAL_FRACTION))
    X_tr, X_val = X_train.iloc[:val_rows], X_train.iloc[val_rows:]
    y_tr, y_val = y_train.iloc[:val_rows], y_train.iloc[val_rows:]

    pre = build_preprocessor().fit(X_tr)
    print(f"[train] loaded {len(raw):,} rows (source={source_used}) | partition train={len(X_train):,} val={len(X_val):,} test={len(X_test):,} fit={len(X_tr):,}", flush=True)
    run_start = time.perf_counter()
    fitted = {}
    train_time_s = {}
    for name, factory in MODELS.items():
        t0 = time.perf_counter()
        print(f"[train] fitting {name} ...", flush=True)
        fitted[name] = Pipeline([("pre", pre), ("reg", factory())]).fit(X_tr, y_tr)
        train_time_s[name] = round(time.perf_counter() - t0, 2)
        print(f"[train] {name} done in {train_time_s[name]}s", flush=True)
    total_train_s = round(time.perf_counter() - run_start, 2)
    print(f"[train] all fits done in {total_train_s}s | scoring validation + test ...", flush=True)

    # Metrics on validation (selection) + final test (reporting)
    val_scores = _score_all(fitted, X_val, y_val)
    test_scores = _score_all(fitted, X_test, y_test)

    best_name = _select_best(val_scores)
    weights = _ensemble_weights(val_scores)

    # Ensemble: weighted average of predictions (weights from validation MAE)
    ens_pred = np.zeros(len(X_test))
    for name, w in weights.items():
        ens_pred += w * fitted[name].predict(X_test)
    ens_scores = _metrics(y_test, ens_pred)

    # Save all artifacts
    for name, pipe in fitted.items():
        joblib.dump(pipe, cfg.MODEL_FILES[name])
    joblib.dump(pre, cfg.PREPROCESSOR_FILE)
    joblib.dump(
        {
            "names": list(fitted.keys()),
            "weights": weights,
            "best_model": best_name,
        },
        cfg.ENSEMBLE_FILE,
    )

    meta = {
        "generated_at": datetime.now().isoformat(),
        "data_source": source_used,
        "n_train_rows": int(len(X_train)),
        "n_fit_rows": int(len(X_tr)),
        "n_val_rows": int(len(X_val)),
        "n_test_rows": int(len(X_test)),
        "split": {
            "test_fraction": cfg.TEST_FRACTION,
            "val_fraction": cfg.VAL_FRACTION,
            "strategy": "chronological by journey_date",
        },
        "features": {"numeric": cfg.NUMERIC_FEATURES, "categorical": cfg.CATEGORICAL_FEATURES},
        "target": cfg.TARGET,
        "best_model": best_name,
        "ensemble": {"weights": {k: round(v, 4) for k, v in weights.items()}},
        "train_time_seconds": train_time_s,
        "total_train_seconds": total_train_s,
        "test_metrics": {k: {m: round(v[m], 4) for m in ("mae", "rmse", "r2", "acc10")} for k, v in test_scores.items()},
        "test_ensemble_metrics": ens_scores,
    }
    cfg.MODEL_META_FILE.write_text(json.dumps(meta, indent=2), encoding="utf-8")

    with open(cfg.FEATURE_COLUMNS_FILE, "w", encoding="utf-8") as f:
        json.dump(cfg.NUMERIC_FEATURES + cfg.CATEGORICAL_FEATURES, f)

    hist = []
    if cfg.TRAIN_HISTORY_FILE.exists():
        hist = json.loads(cfg.TRAIN_HISTORY_FILE.read_text(encoding="utf-8"))
    hist.append(
        {
            "timestamp": datetime.now().isoformat(),
            "data_source": source_used,
            "metrics": meta["test_metrics"],
            "ensemble_metrics": ens_scores,
            "best_model": best_name,
        }
    )
    cfg.TRAIN_HISTORY_FILE.write_text(json.dumps(hist, indent=2), encoding="utf-8")

    return {
        "meta": meta,
        "val_scores": val_scores,
        "test_scores": test_scores,
        "best_model": best_name,
        "ensemble_scores": ens_scores,
        "train_time_s": train_time_s,
        "total_train_s": total_train_s,
        "row_counts": {
            "train_partition": int(len(X_train)),
            "fit": int(len(X_tr)),
            "val": int(len(X_val)),
            "test": int(len(X_test)),
        },
        "fitted": fitted,
    }


if __name__ == "__main__":
    pd.set_option("display.width", 240)
    pd.set_option("display.colheader_justify", "left")
    res = run_training()
    tt = pd.Series(res["train_time_s"], name="train_time_s")
    print("\n=== ROW COUNTS ===")
    print(res["row_counts"])
    print("\n=== VALIDATION METRICS (model selection) ===")
    vdf = pd.DataFrame(res["val_scores"]).T.rename_axis("model")
    vdf["train_time_s"] = tt
    print(vdf)
    print(f"\n=== BEST MODEL: {res['best_model']} ===")
    print("\n=== TEST METRICS (held-out future journeys) ===")
    tdf = pd.DataFrame(res["test_scores"]).T.rename_axis("model")
    tdf["train_time_s"] = tt
    print(tdf)
    print("\n=== ENSEMBLE TEST METRICS ===")
    print(res["ensemble_scores"])
