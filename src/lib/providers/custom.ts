const { AIMessage, AIMessageChunk, BaseMessage, HumanMessage } = require("@langchain/core/messages");
const { BaseChatModel, LangSmithParams } = require("@langchain/core/language_models/chat_models");
const { ChatGenerationChunk } = require("@langchain/core/outputs");
const axios = require('axios');
const { logger } = require('../../utils/logger');
const { ChatOpenAI } = require('@langchain/openai');

export const loadCustomChatModels = async () => {
    console.log("------------CUSTOM------------");

    try {
        const model1 = new CustomModel({});
        const chatModels = {
            'custom-rag': {
                displayName: 'custom-rag-model',
                model: model1
            }
        };

        return chatModels;
    } catch (err) {
        logger.error(`Error loading Custom models: ${err}`);
        console.log(`Error loading Cutom models: ${err}`);
        return {};
    }
};

class CustomModel extends BaseChatModel {

    constructor(fields) {
        super(fields ?? {});
    }

    async *_streamResponseChunks(messages, options, runManager) {
        console.log("----------------------STREAMING-------------------")
        const streamUrl = ' http://5.78.113.143:8005/stream_chat/1/1';
        try {
            const response = await axios({
                method: 'post',
                url: streamUrl,
                data: {
                    "question": messages[0].content
                },
                responseType: 'stream', // Enables streaming
                headers: {
                    'Content-Type': 'application/json', // Specify JSON body
                },
            });

            for await (const token of response.data) {
                const content = token.toString();
                const chunk = new AIMessageChunk({ content });
                const generationChunk = new ChatGenerationChunk({
                    message: chunk,
                    text: chunk.content
                });
                // console.log(generationChunk);
                yield generationChunk;

                void runManager?.handleLLMNewToken(generationChunk.text ?? "", undefined, undefined, undefined, undefined, { chunk: generationChunk });

            }
        } catch (error) {
            console.error('Error in fetching stream:', error);
        }
    }
    async _generate(messages, options, runManager) {
        console.log("--------------INPUT LLM MESSAGES----------");
        console.log(messages);
        // console.log(messages[messages.length - 1]);
        let responseData;
        let data;
        try {
            data = JSON.stringify({
                "question": messages[0].content
            });
        } catch (error) {
            console.log("Serialization error ->", error);
        }

        let config = {
            method: 'post',
            maxBodyLength: Infinity,
            url: 'http://5.78.113.143:8005/text_model/?user_id=1&chat_id=1',
            headers: {
                'accept': 'application/json',
                'Content-Type': 'application/json'
            },
            data: data
        };

        await axios.request(config)
            .then((response) => {
                responseData = response.data;
                console.log(JSON.stringify(response.data));
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
        return "custom RAG model";
    }

}
