/*
 * Copyright 2017-2018, Strimzi authors.
 * License: Apache License 2.0 (see the file LICENSE or http://apache.org/licenses/LICENSE-2.0.html).
 */

package io.strimzi;

import java.util.Collections;
import java.util.List;

import org.apache.kafka.common.errors.UnknownTopicOrPartitionException;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

import io.fabric8.kubernetes.client.KubernetesClient;
import io.strimzi.api.kafka.model.KafkaTopic;
import io.vertx.core.AbstractVerticle;
import io.vertx.core.Future;
import io.vertx.core.http.HttpServer;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import io.vertx.ext.web.Router;
import io.vertx.ext.web.RoutingContext;
import io.vertx.ext.web.handler.BodyHandler;
import io.vertx.kafka.admin.TopicDescription;

public class ConsoleServer extends AbstractVerticle {

    private static final Logger log = LogManager.getLogger(ConsoleServer.class);

    private final ConsoleServerConfig config;
    private final KubernetesClient kubeClient;

    private TopicConsole topicConsole;

    public ConsoleServer(ConsoleServerConfig config, KubernetesClient kubeClient, TopicConsole topicConsole) {
        this.config = config;
        this.kubeClient = kubeClient;
        this.topicConsole = topicConsole;
    }

    @Override
    public void start(Future<Void> startFuture) throws Exception {
        log.info("Starting ConsoleServer");

        HttpServer server = this.vertx.createHttpServer();

        Router router = Router.router(this.vertx);
        router.route().handler(BodyHandler.create());

        router.get("/topics").handler(this::getTopics);
        router.get("/topics/:topicname").handler(this::getTopic);
        router.post("/topics").handler(this::createTopic);
        router.delete("/topics/:topicname").handler(this::deleteTopic);

        server.requestHandler(router).listen(8080, ar -> {
            if (ar.succeeded()) {
                log.info("HTTP REST API server started, listening on port {}", 8080);
                startFuture.complete();
            } else {
                log.error("HTTP REST API failed to start", ar.cause());
                startFuture.fail(ar.cause());
            }
        });
    }

    private void createTopic(RoutingContext routingContext) {
        try {
            JsonObject json = new JsonObject(routingContext.getBodyAsString());
            log.info("Creating topic {}", json);
            
            // TODO: making labels configurable
            KafkaTopic kafkaTopic = TopicUtils.from(json, Collections.singletonMap("strimzi.io/cluster", "my-cluster"));
            this.topicConsole.createTopic(kafkaTopic).setHandler(ar -> {
                if (ar.succeeded()) {
                    log.info("Topic {} created", kafkaTopic.getMetadata().getName());
                    routingContext.response().setStatusCode(202).end();
                } else {
                    log.error("Topic creation failed", ar.cause());
                    routingContext.response().setStatusCode(500).end();
                }
            });
        } catch (Exception ex) {
            log.error("Topic creation failed", ex);
            routingContext.response().setStatusCode(500).end();
        }
    }

    private void deleteTopic(RoutingContext routingContext) {
        String topicName = routingContext.request().getParam("topicname");
        log.info("Deleting topic {}", topicName);

        this.topicConsole.deleteTopic(topicName).setHandler(ar -> {
            if (ar.succeeded()) {
                log.info("Topic {} deleted", topicName);
                routingContext.response().setStatusCode(202).end();
            } else {
                log.error("Topic deletion failed", ar.cause());
                routingContext.response().setStatusCode(500).end();
            }
        });
    }

    private void getTopics(RoutingContext routingContext) {
        log.info("Getting topics list");

        this.topicConsole.listTopics().setHandler(ar -> {
            if (ar.succeeded()) {               

                List<KafkaTopic> kafkaTopicList = ar.result().getItems();

                if (!kafkaTopicList.isEmpty()) {
                    JsonArray jsonTopics = TopicUtils.to(kafkaTopicList);
                    log.info("Topics list {}", jsonTopics);
                    routingContext.response().setStatusCode(200).end(jsonTopics.encode());
                } else {
                    log.info("Topics list is empty");
                    routingContext.response().setStatusCode(404).end();
                }

            } else {
                log.error("Getting topics list failed", ar.cause());
                routingContext.response().setStatusCode(500).end();
            }
        });
    }

    private void getTopic(RoutingContext routingContext) {
        String topicName = routingContext.request().getParam("topicname");
        log.info("Get topic metadata");
        
        this.topicConsole.getTopic(topicName).setHandler(ar -> {
            if (ar.succeeded()) {
                TopicDescription topicDescription = ar.result();
                JsonObject json = TopicUtils.to(topicDescription);
                log.info("Topic {} metadata {}", topicName, json);
                routingContext.response().setStatusCode(200).end(json.encode());
            } else {
                log.error("Getting topic metadata failed", ar.cause());

                if (ar.cause() instanceof UnknownTopicOrPartitionException) {
                    routingContext.response().setStatusCode(404).end();
                } else {
                    routingContext.response().setStatusCode(500).end();
                }
            }
        });
    }

    @Override
    public void stop(Future<Void> stopFuture) throws Exception {
        log.info("Stopping ConsoleServer");
        super.stop(stopFuture);
    }
}