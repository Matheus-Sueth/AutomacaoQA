import requests

def get_user_by_token(access_token: str, token_type:str, region: str) -> dict:
    url = f"https://api.{region}/api/v2/users/me"

    headers = {
    'Authorization': f'{token_type} {access_token}'
    }

    response = requests.get(url, headers=headers)

    return response.json()
