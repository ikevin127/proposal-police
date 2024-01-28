import { Probot } from "probot";
import { handleIssueCommentCreated, handleIssueCommentEdited } from "./eventHandlers";

// populate process.env with values from .env file otherwise tests will fail
require("dotenv").config("../.env");

// For more information on building apps:
// https://probot.github.io/docs/

// To get your app running against GitHub, see:
// https://probot.github.io/docs/development/

export = (app: Probot) => {
  app.on("issue_comment.created", handleIssueCommentCreated);
  app.on("issue_comment.edited", handleIssueCommentEdited);
};
