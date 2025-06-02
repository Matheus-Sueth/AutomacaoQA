from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import RedirectResponse

class RemoveTrailingSlashMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        if request.url.path != "/" and request.url.path.endswith("/"):
            url = str(request.url).rstrip("/")
            return RedirectResponse(url=url)
        return await call_next(request)