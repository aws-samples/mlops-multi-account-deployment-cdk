import base64
import boto3
import logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)
sm_client = boto3.client("sagemaker")


def on_create(domain_id: str, studio_lifecycle_config_name: str):
    """Function to execute when creating a new custom resource

    Args:
        domain_id (str): SageMaker Studio Domain ID
        studio_lifecycle_config_name (str): Name of the lcc

    Returns:
        result (json): status and physical resource id
    """
    logger.info("create new resource")

    with open("shutdown-idle-kernels.sh", "rb") as f:
        script_content = f.read()
    encoded_script_content = base64.b64encode(script_content).decode()

    try:
        list_lcc = sm_client.list_studio_lifecycle_configs()['StudioLifecycleConfigs']
        list_lcc_names = [config['StudioLifecycleConfigName'] for config in list_lcc]
        # Checking if LifeCycle already exist
        if studio_lifecycle_config_name not in list_lcc_names:
            response = sm_client.create_studio_lifecycle_config(
                StudioLifecycleConfigName=studio_lifecycle_config_name,
                StudioLifecycleConfigContent=encoded_script_content,
                StudioLifecycleConfigAppType="JupyterServer"
            )

            lcc_arn = response["StudioLifecycleConfigArn"]

        else:
            index = list_lcc_names.index(studio_lifecycle_config_name)
            lcc_arn = list_lcc[index]['StudioLifecycleConfigArn']

        sm_client.update_domain(
            DomainId=domain_id,
            DefaultUserSettings={
                "JupyterServerAppSettings": {
                    "DefaultResourceSpec": {
                        "LifecycleConfigArn": lcc_arn,
                        "InstanceType": "system"
                    },
                    "LifecycleConfigArns": [lcc_arn],
                }
            }
        )
        return {
            "Status": "SUCCESS",
            "PhysicalResourceId": lcc_arn
        }

    except:
        logger.exception("failed to create lifecycle config")
        return {
            "Status": "FAILED",
        }


def on_update(domain_id: str, studio_lifecycle_config_name: str, physical_resource_id: str):
    """Function to execute when updating the custom resource

    Args:
        domain_id (str): SageMaker Studio Domain ID
        studio_lifecycle_config_name (str): Name of the lcc
        physical_resource_id (str): physical resource id

    Returns:
        result (json): status and physical resource id
    """
    logger.info("update resource")

    on_delete(studio_lifecycle_config_name, physical_resource_id)

    return on_create(domain_id, studio_lifecycle_config_name)


def on_delete(studio_lifecycle_config_name: str, physical_resource_id: str):
    """Function to execute when deleting the custom resource

    Args:
        domain_id (str): SageMaker Studio Domain ID
        studio_lifecycle_config_name (str): Name of the lcc

    Returns:
        result (json): status and physical resource id
    """
    logger.info("delete resource")

    try:
        sm_client.delete_studio_lifecycle_config(
            StudioLifecycleConfigName=studio_lifecycle_config_name
        )
        return {
            "Status": "SUCCESS",
            "PhysicalResourceId": physical_resource_id
        }

    except:
        logger.exception("failed to delete lifecycle config")
        return {
            "Status": "FAILED",
            "PhysicalResourceId": physical_resource_id
        }


def handler(event, context):
    logger.info(event)
    domain_id = event["ResourceProperties"]["DOMAIN_ID"]
    studio_lifecycle_config_name = event["ResourceProperties"]["LIFECYCLE_CONFIG_NAME"].lower()
    physical_resource_id = event.get("PhysicalResourceId")

    request_type = event["RequestType"]
    if request_type == "Create":
        return on_create(domain_id, studio_lifecycle_config_name)
    if request_type == "Update":
        return on_update(domain_id, studio_lifecycle_config_name, physical_resource_id)
    if request_type == "Delete":
        return on_delete(studio_lifecycle_config_name, physical_resource_id)
    raise Exception(f"Invalid request type: {request_type}")
