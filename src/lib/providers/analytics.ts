const { AIMessage, AIMessageChunk, BaseMessage, HumanMessage } = require("@langchain/core/messages");
const { BaseChatModel, LangSmithParams } = require("@langchain/core/language_models/chat_models");
const { ChatGenerationChunk } = require("@langchain/core/outputs");
const axios = require('axios');
// const { logger } = require('../../utils/logger');
const { ChatOpenAI } = require('@langchain/openai');
import path from 'path';
import fs from 'fs';


export const loadAnalyticsModel = async () => {
    console.log("------------CUSTOM------------");

    try {
        const model1 = new AnalyticsModel({});
        const chatModels = {
            'analytics': {
                displayName: 'analytics-model',
                model: model1
            }
        };

        return chatModels;
    } catch (err) {
        // logger.error(`Error loading Custom models: ${err}`);
        console.log(`Error loading Cutom models: ${err}`);
        return {};
    }
};

export class AnalyticsModel extends BaseChatModel {
    private html_byte_strings: [];
    private promise;

    constructor(fields) {
        super(fields ?? {});
    }

    async *_streamResponseChunks(messages, options, runManager) {
        console.log("----------------------STREAMING-------------------")
        const streamUrl = ' http://5.78.113.143:8005/stream/1/1';
        try {

            let data = JSON.stringify({
                "question": messages[0].content
            });

            let config = {
                method: 'post',
                maxBodyLength: Infinity,
                url: 'http://5.78.113.143:8005/analytical_model/1/1',
                headers: {
                    'Content-Type': 'application/json'
                },
                data: data
            };

            this.promise = axios.request(config);

            console.log("-------------------------hitting stream api-------------")
            const controller = new AbortController(); // Create AbortController
            const timeoutDuration = 10000; // 5 seconds timeout for stream response
            let timeout: NodeJS.Timeout;

            const response = await axios({
                method: 'get',
                url: streamUrl,
                responseType: 'stream', // Enables streaming
                signal: controller.signal, // Pass AbortController signal
            });

            let stream_output = '';



            // Function to reset timeout
            const resetTimeout = () => {
                if (timeout) clearTimeout(timeout);
                timeout = setTimeout(() => {
                    console.log("Stream timeout: No token received for 5 seconds");
                    controller.abort(); // Abort the request
                }, timeoutDuration);
            };

            for await (const token of response.data) {
                // Clear and reset the timeout every time data is received
                resetTimeout();

                const content = token.toString();
                stream_output += content;
                if (stream_output.includes("TERMINATE")) {
                    stream_output = stream_output.replace(/TERMINATE|TER(?:INA(?:TE?)?)?/, "");
                    const loading = " \n ###Loading Charts ..................";
                    const chunk = new AIMessageChunk({ content: loading });
                    const generationChunk = new ChatGenerationChunk({
                        message: chunk,
                        text: chunk.content
                    });
                    // console.log(generationChunk);
                    yield generationChunk;
                    clearTimeout(timeout);
                    break;
                }
                // console.log('token:', content);
                const chunk = new AIMessageChunk({ content });
                const generationChunk = new ChatGenerationChunk({
                    message: chunk,
                    text: chunk.content
                });
                // console.log(generationChunk);
                yield generationChunk;

                void runManager?.handleLLMNewToken(generationChunk.text ?? "", undefined, undefined, undefined, undefined, { chunk: generationChunk });
            }
            clearTimeout(timeout); // Clear timeout when stream ends naturally
        } catch (error) {
            if (axios.isCancel(error)) {
                console.log("Stream aborted due to timeout.");
            } else {
                console.error("Error in fetching stream:", error.message);
            }
        }
    }

    _get_promise() {
        return this.promise;
    }

    _get_html() {
        return this.html_byte_strings;
    }

    async _generate(messages, options, runManager) {
        console.log("----------------------INVOKING-------------------")
        console.log("--------------INPUT LLM MESSAGES----------");
        console.log(messages);
        // console.log(messages[messages.length - 1]);
        let responseData;
        let data;
        try {
            data = JSON.stringify({
                "question": messages[0].content
            });
            console.log("data ----->", data)
        } catch (error) {
            console.log("Serialization error ->", error);
        }

        let config = {
            method: 'post',
            maxBodyLength: Infinity,
            url: 'http://5.78.113.143:8005/analytical_model/1/1',
            headers: {
                'Content-Type': 'application/json'
            },
            data: data
        };

        await axios.request(config)
            .then((response) => {
                responseData = response.data;
                console.log("-------------INVOKE API FINISHED--------------------");
            })
            .catch((error) => {

                console.log(error);
            });

        const generations = [];
        const text = responseData?.result?.response ?? "";
        const generation = {
            text,
            message: new AIMessage(responseData?.result?.response ?? ""),
        };
        generations.push(generation);
        console.log("----------------GENERATIONS------------------");
        console.log(generations);
        return {
            generations
        };

    }



    _llmType() {
        return "Analutics model";
    }

}
// module.exports = AnalyticsModel;