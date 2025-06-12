import redis
import redis.asyncio as redis_async

redis_client = redis.Redis(host="localhost", port=6379, decode_responses=True)
redis_client_async = redis_async.Redis(host="localhost", port=6379, decode_responses=True)