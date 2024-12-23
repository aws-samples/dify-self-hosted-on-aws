# ほぼ全て Dify 公式ドキュメントの通り、一部改変
import boto3
import os

AWS_REGION = os.environ.get("BEDROCK_REGION")


class ExternalDatasetService:
    @staticmethod
    def knowledge_retrieval(retrieval_setting: dict, query: str, knowledge_id: str):
        conf = knowledge_id.split(':')
        if (len(conf) == 2):
            region = conf[0]
            kb_id = conf[1]
        else:
            region = AWS_REGION
            kb_id = knowledge_id
        # get bedrock client
        client = boto3.client(
            "bedrock-agent-runtime",
            region_name=region,
        )
        # fetch external knowledge retrieval
        response = client.retrieve(
            knowledgeBaseId=kb_id,
            retrievalConfiguration={
                "vectorSearchConfiguration": {
                    "numberOfResults": retrieval_setting.get("top_k"),
                    "overrideSearchType": "HYBRID",
                }
            },
            retrievalQuery={"text": query},
        )
        # parse response
        results = []
        if (
            response.get("ResponseMetadata")
            and response.get("ResponseMetadata").get("HTTPStatusCode") == 200
        ):
            if response.get("retrievalResults"):
                retrieval_results = response.get("retrievalResults")
                for retrieval_result in retrieval_results:
                    # filter out results with score less than threshold
                    if retrieval_result.get("score") < retrieval_setting.get(
                        "score_threshold", 0.0
                    ):
                        continue
                    result = {
                        "metadata": retrieval_result.get("metadata"),
                        "score": retrieval_result.get("score"),
                        "title": retrieval_result.get("metadata").get(
                            "x-amz-bedrock-kb-source-uri"
                        ),
                        "content": retrieval_result.get("content").get("text"),
                    }
                    results.append(result)
        return {"records": results}
