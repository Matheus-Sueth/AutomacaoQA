import requests
import json
import datetime


def get_user_by_token(access_token: str, token_type: str, region: str) -> dict:
    url = f"https://api.{region}/api/v2/users/me"

    headers = {
    'Authorization': f'{token_type} {access_token}'
    }

    response = requests.get(url, headers=headers)

    return response.json()


def get_conversation_by_remote(access_token: str, token_type: str, region: str, data_inicio: datetime.datetime, data_fim: datetime.datetime, remote: str, address_to: str) -> dict:
    url = f"https://api.{region}/api/v2/analytics/conversations/details/query"

    payload = json.dumps({
    "order": "desc",
    "orderBy": "conversationStart",
    "paging": {
        "pageSize": 50,
        "pageNumber": 1
    },
    "interval": f"{data_inicio.strftime('%Y-%m-%dT%H:%M:%S.000Z')}/{data_fim.strftime('%Y-%m-%dT%H:%M:%S.000Z')}",
    "segmentFilters": [
        {
        "type": "or",
        "predicates": [
            {
            "dimension": "direction",
            "value": "inbound"
            },
            {
            "dimension": "direction",
            "value": "outbound"
            }
        ]
        },
        {
        "type": "or",
        "predicates": [
            {
            "dimension": "remote",
            "value": remote
            }
        ]
        },
        {
        "type": "or",
        "clauses": [
            {
            "type": "and",
            "predicates": [
                {
                "value": address_to,
                "dimension": "addressTo"
                },
                {
                "dimension": "purpose",
                "value": "customer"
                }
            ]
            },
            {
            "type": "and",
            "predicates": [
                {
                "value": address_to,
                "dimension": "addressTo"
                },
                {
                "dimension": "purpose",
                "value": "external"
                }
            ]
            },
            {
            "type": "and",
            "predicates": [
                {
                "dimension": "direction",
                "value": "outbound"
                },
                {
                "value": address_to,
                "dimension": "addressTo",
                "type": "dimension"
                },
                {
                "dimension": "purpose",
                "value": "agent"
                }
            ]
            },
            {
            "type": "and",
            "predicates": [
                {
                "value": address_to,
                "dimension": "addressTo"
                },
                {
                "dimension": "purpose",
                "value": "api"
                }
            ]
            },
            {
            "type": "and",
            "predicates": [
                {
                "dimension": "purpose",
                "value": "campaign"
                },
                {
                "value": address_to,
                "dimension": "addressTo"
                }
            ]
            }
        ]
        }
    ],
    "conversationFilters": [],
    "evaluationFilters": [],
    "surveyFilters": []
    })

    headers = {
    'Authorization': f'{token_type} {access_token}',
    'Content-Type': 'application/json'
    }

    response = requests.post(url, headers=headers, data=payload)

    if not response.ok:
        raise Exception(f"get_conversation_by_remote({access_token}, {token_type}, {region}, {data_inicio}, {data_fim}, {remote}, {address_to}) - {response.status_code} - {response.content}")
    
    dados = response.json()

    if dados["totalHits"] == 0:
        return None
    
    return dados["conversations"][0]
    

def disconnect_interaction(access_token: str, token_type: str, region: str, conversation_id: str) -> None:
    url = f"https://api.{region}/api/v2/conversations/{conversation_id}/disconnect"

    payload = {}

    headers = {
    'Authorization': f'{token_type} {access_token}',
    'Content-Type': 'application/json'
    }

    response = requests.post(url, headers=headers, data=payload)

    if not response.ok:
        raise Exception(f"disconnect_interaction({access_token}, {token_type}, {region}, {conversation_id}) - {response.status_code} - {response.content}")
