import { json } from "@remix-run/server-runtime";
import {
  CompleteWaitpointTokenRequestBody,
  CompleteWaitpointTokenResponseBody,
  conditionallyExportPacket,
  stringifyIO,
} from "@trigger.dev/core/v3";
import { WaitpointId } from "@trigger.dev/core/v3/apps";
import { z } from "zod";
import { $replica } from "~/db.server";
import { env } from "~/env.server";
import { logger } from "~/services/logger.server";
import { createActionApiRoute } from "~/services/routeBuilders/apiBuilder.server";
import { engine } from "~/v3/runEngine.server";

const { action } = createActionApiRoute(
  {
    params: z.object({
      waitpointFriendlyId: z.string(),
    }),
    body: CompleteWaitpointTokenRequestBody,
    maxContentLength: env.TASK_PAYLOAD_MAXIMUM_SIZE,
    method: "POST",
  },
  async ({ authentication, body, params }) => {
    // Resume tokens are actually just waitpoints
    const waitpointId = WaitpointId.toId(params.waitpointFriendlyId);

    try {
      //check permissions
      const waitpoint = await $replica.waitpoint.findFirst({
        where: {
          id: waitpointId,
          environmentId: authentication.environment.id,
        },
      });

      if (!waitpoint) {
        throw json({ error: "Waitpoint not found" }, { status: 404 });
      }

      const stringifiedData = await stringifyIO(body.data);
      const finalData = await conditionallyExportPacket(
        stringifiedData,
        `${waitpointId}/waitpoint/token`
      );

      const result = await engine.completeWaitpoint({
        id: waitpointId,
        output: finalData.data
          ? { type: finalData.dataType, value: finalData.data, isError: false }
          : undefined,
      });

      return json<CompleteWaitpointTokenResponseBody>(
        {
          success: true,
        },
        { status: 200 }
      );
    } catch (error) {
      logger.error("Failed to complete waitpoint token", { error });
      throw json({ error: "Failed to complete waitpoint token" }, { status: 500 });
    }
  }
);

export { action };
