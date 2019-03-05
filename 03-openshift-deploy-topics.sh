#!/bin/bash

NAMESPACE=${STRIMZI_NAMESPACE:-strimzi}
CLUSTER=${STRIMZI_CLUSTER:-my-cluster}

sed -i "s/my-cluster/$CLUSTER/" kafka/cluster/kafka-topics.yaml

oc apply -f kafka/cluster/kafka-topics.yaml -n $NAMESPACE