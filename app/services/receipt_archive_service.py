import json


def serialize_receipt_payload(payload) -> str:
    return json.dumps(payload, ensure_ascii=False)


def deserialize_receipt_payload(raw: str) -> dict:
    try:
        return json.loads(raw)
    except Exception:
        return {}
