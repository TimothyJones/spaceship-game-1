import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CfnOutput, Duration, RemovalPolicy, Stack } from "aws-cdk-lib";
import { AttributeType, BillingMode, Table } from "aws-cdk-lib/aws-dynamodb";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import { NodejsFunction, OutputFormat } from "aws-cdk-lib/aws-lambda-nodejs";
import { HttpApi, HttpMethod } from "aws-cdk-lib/aws-apigatewayv2";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..");

// The whole backend: one router Lambda behind an HTTP API, with game state in
// DynamoDB. Mirrors what src/local-server.js runs in-memory for local dev.
export class SpaceBeStack extends Stack {
  constructor(scope, id, props) {
    super(scope, id, props);

    // One item per game, keyed by id. Items self-expire a day after their
    // last write via the TTL attribute the store code sets.
    const table = new Table(this, "GamesTable", {
      partitionKey: { name: "id", type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: "expiresAt",
      // Game state is ephemeral, so tear the table down with the stack.
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // NodejsFunction bundles src/lambda.js with esbuild, pulling in the
    // workspace-linked space-engine package. The AWS SDK v3 is provided by
    // the Node runtime, so it's left external rather than bundled.
    const api = new NodejsFunction(this, "ApiFunction", {
      entry: join(here, "..", "src", "lambda.js"),
      handler: "handler",
      runtime: Runtime.NODEJS_22_X,
      timeout: Duration.seconds(10),
      memorySize: 256,
      environment: { GAME_TABLE: table.tableName },
      // Resolve the workspace lockfile from the repo root, not space-be/.
      depsLockFilePath: join(repoRoot, "package-lock.json"),
      projectRoot: repoRoot,
      bundling: {
        format: OutputFormat.ESM,
        target: "node22",
        externalModules: ["@aws-sdk/*"],
      },
    });

    table.grantReadWriteData(api);

    // ANY /api/{proxy+} — the Lambda routes everything and handles CORS and
    // OPTIONS itself, matching the local server.
    const httpApi = new HttpApi(this, "GameApi");
    httpApi.addRoutes({
      path: "/api/{proxy+}",
      methods: [HttpMethod.ANY],
      integration: new HttpLambdaIntegration("ApiIntegration", api),
    });

    new CfnOutput(this, "ApiUrl", {
      value: httpApi.apiEndpoint,
      description:
        "Base URL for the game API. Set the frontend's VITE_API_URL to this + /api",
    });
  }
}
