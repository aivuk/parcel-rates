"""422 responses written for a shop owner: {detail: [{loc, msg, type}]}."""

from __future__ import annotations

from fastapi import Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse


def _num(value) -> str:
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value)


def _field(loc: tuple) -> str:
    names = [str(p) for p in loc if isinstance(p, str) and p not in ("body", "query")]
    return names[-1] if names else "request"


def _prefix(loc: tuple) -> str:
    parts = list(loc)
    if "parcels" in parts:
        i = parts.index("parcels")
        if i + 1 < len(parts) and isinstance(parts[i + 1], int):
            return f"Parcel {parts[i + 1] + 1}: "
    return ""


def friendly_message(error: dict) -> str:
    loc = tuple(error.get("loc", ()))
    kind = error.get("type", "")
    ctx = error.get("ctx") or {}
    field = _field(loc)
    messages = {
        "missing": f"{field} is required",
        "less_than_equal": f"{field} must be at most {_num(ctx.get('le'))}",
        "less_than": f"{field} must be less than {_num(ctx.get('lt'))}",
        "greater_than": f"{field} must be greater than {_num(ctx.get('gt'))}",
        "greater_than_equal": f"{field} must be at least {_num(ctx.get('ge'))}",
        "float_parsing": f"{field} must be a number",
        "float_type": f"{field} must be a number",
        "int_parsing": f"{field} must be a whole number",
        "int_type": f"{field} must be a whole number",
        "int_from_float": f"{field} must be a whole number",
        "bool_parsing": f"{field} must be true or false",
        "bool_type": f"{field} must be true or false",
        "literal_error": f"{field} must be one of {ctx.get('expected')}",
        "date_parsing": f"{field} must be a date like 2026-01-18",
        "date_from_datetime_parsing": f"{field} must be a date like 2026-01-18",
        "date_type": f"{field} must be a date like 2026-01-18",
        "too_short": f"{field} needs at least {ctx.get('min_length')} item(s)",
        "too_long": f"{field} can have at most {ctx.get('max_length')} items",
        "list_type": f"{field} must be a list",
        "model_type": f"{field} must be an object",
        "dict_type": f"{field} must be an object",
        "json_invalid": "the request body is not valid JSON",
        "extra_forbidden": f"{field} is not a known field",
    }
    if kind == "value_error":
        msg = str(error.get("msg", "")).removeprefix("Value error, ")
    else:
        msg = messages.get(kind, str(error.get("msg", "invalid value")))
    return _prefix(loc) + msg


async def validation_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
    detail = [
        {"loc": list(e.get("loc", ())), "msg": friendly_message(e), "type": e.get("type", "")}
        for e in exc.errors()
    ]
    return JSONResponse(status_code=422, content=jsonable_encoder({"detail": detail}))


def invalid(loc: list, msg: str, kind: str = "value_error") -> RequestValidationError:
    """Build a 422 for checks that need the loaded data (e.g. unknown year)."""
    return RequestValidationError([{"loc": tuple(loc), "msg": msg, "type": kind}])
