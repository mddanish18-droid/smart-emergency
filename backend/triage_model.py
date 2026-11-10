"""AI triage: predicts severity (0=low, 1=medium, 2=critical) from symptoms.

NOTE: trained on SYNTHETIC data generated from clinical-style rules plus noise.
For your report, replace/augment with a real public dataset and evaluate honestly.
"""
import random
from pathlib import Path

import joblib
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import classification_report
from sklearn.model_selection import train_test_split

MODEL_PATH = Path(__file__).parent / "triage_model.joblib"
LABELS = ["low", "medium", "critical"]

# symptom -> (weight toward severity, specialty needed)
SYMPTOMS = {
    "unconscious": (3, "emergency"),
    "severe_bleeding": (3, "trauma"),
    "chest_pain": (3, "cardiology"),
    "breathing_difficulty": (3, "emergency"),
    "stroke_signs": (3, "neurology"),
    "seizure": (2, "neurology"),
    "burns": (2, "burns"),
    "fracture": (2, "trauma"),
    "high_fever": (1, "general"),
    "vomiting": (1, "general"),
    "headache": (1, "general"),
    "minor_injury": (0, "general"),
    "abdominal_pain": (2, "general"),
    "allergic_reaction": (3, "emergency"),
    "fainting": (2, "emergency"),
    "poisoning": (3, "emergency"),
    "pregnancy_emergency": (3, "emergency"),
    "eye_injury": (2, "trauma"),
    "confusion": (2, "neurology"),
    "diarrhea": (1, "general"),
}
FEATURES = list(SYMPTOMS) + ["age"]


def _synthetic_row():
    row = {s: int(random.random() < 0.15) for s in SYMPTOMS}
    row["age"] = random.randint(1, 90)
    score = sum(SYMPTOMS[s][0] * row[s] for s in SYMPTOMS)
    if row["age"] > 65 or row["age"] < 5:
        score += 1
    score += random.choice([-1, 0, 0, 0, 1])  # label noise
    label = 2 if score >= 3 else (1 if score >= 1 else 0)
    return [row[f] for f in FEATURES], label


def train(n=4000):
    data = [_synthetic_row() for _ in range(n)]
    X = np.array([d[0] for d in data])
    y = np.array([d[1] for d in data])
    Xtr, Xte, ytr, yte = train_test_split(X, y, test_size=0.2, random_state=42)
    clf = RandomForestClassifier(n_estimators=120, random_state=42).fit(Xtr, ytr)
    print(classification_report(yte, clf.predict(Xte), target_names=LABELS))
    joblib.dump(clf, MODEL_PATH)
    return clf


_model = None


def predict_severity(symptoms: list[str], age: int):
    """Returns (label, confidence, needed_specialty)."""
    global _model
    if _model is None:
        _model = joblib.load(MODEL_PATH) if MODEL_PATH.exists() else train()
    vec = [[int(s in symptoms) for s in SYMPTOMS] + [age]]
    probs = _model.predict_proba(vec)[0]
    label = LABELS[int(_model.classes_[np.argmax(probs)])]
    # most severe symptom decides specialty
    known = [s for s in symptoms if s in SYMPTOMS]
    specialty = max(known, key=lambda s: SYMPTOMS[s][0]) if known else None
    specialty = SYMPTOMS[specialty][1] if specialty else "general"
    return label, float(max(probs)), specialty


if __name__ == "__main__":
    train()
