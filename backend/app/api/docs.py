"""Interactive API docs under /api, so they are reachable through the nginx proxy.

FastAPI's stock Swagger page loads an unpinned bundle and runs an inline script,
which the nginx Content-Security-Policy blocks. This page pins Swagger UI with
Subresource Integrity and starts it from a same-origin script instead.
"""

from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import HTMLResponse, Response

OPENAPI_URL = "/api/openapi.json"
DOCS_URL = "/api/docs"
SWAGGER_UI = "https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.34.0"
SWAGGER_JS_SRI = "sha384-9Td7MKiIr2S83E1kZyyVi8KdJw/S8CpAvu0llLyMeg0xq/hDGiZJfVn0fV4llCmK"
SWAGGER_CSS_SRI = "sha384-4c3vsE5f+trhFyHrFrLM1fFGUn531NIaC7dcqEWIJdoRQJ5CkJbSuSCwXLpaS1KF"

# The request in docs/api-examples/quote.json, offered by "Try it out".
QUOTE_EXAMPLE = {
    "parcel": {
        "weight_lb": 3.2,
        "length_in": 14,
        "width_in": 12,
        "height_in": 10,
        "distance_miles": 700,
        "residential": True,
        "speed": "ground",
        "delivery_area": "das",
    },
    "controls": {"year": 2026},
}

DOCS_HTML = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Parcel rates API</title>
<link rel="stylesheet" href="{SWAGGER_UI}/swagger-ui.css" integrity="{SWAGGER_CSS_SRI}" crossorigin="anonymous">
</head>
<body>
<div id="swagger-ui"></div>
<script src="{SWAGGER_UI}/swagger-ui-bundle.js" integrity="{SWAGGER_JS_SRI}" crossorigin="anonymous"></script>
<script src="{DOCS_URL}/init.js"></script>
</body>
</html>
"""

INIT_JS = f"""SwaggerUIBundle({{
  url: "{OPENAPI_URL}",
  dom_id: "#swagger-ui",
  deepLinking: true,
  tryItOutEnabled: true,
}});
"""

router = APIRouter(include_in_schema=False)


@router.get(DOCS_URL, response_class=HTMLResponse)
def docs() -> str:
    return DOCS_HTML


@router.get(f"{DOCS_URL}/init.js")
def docs_init() -> Response:
    return Response(INIT_JS, media_type="text/javascript")
