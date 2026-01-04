/**
 * CI 环境变量配置支持
 * 自动检测和读取 CI 环境变量
 */

import type { CIProvider } from './ci-reporter'

/**
 * CI 环境信息
 */
export interface CIEnvironment {
  /** 是否在 CI 环境中 */
  isCI: boolean
  /** CI 提供商 */
  provider: CIProvider
  /** 构建 ID */
  buildId?: string
  /** 构建编号 */
  buildNumber?: string
  /** 分支名称 */
  branch?: string
  /** 提交 SHA */
  commit?: string
  /** PR 编号 */
  prNumber?: string
  /** 仓库 */
  repository?: string
  /** 构建 URL */
  buildUrl?: string
  /** 作业名称 */
  jobName?: string
}

/**
 * CI 环境检测器
 */
export class CIEnvironmentDetector {
  /**
   * 检测 CI 环境
   */
  detect(): CIEnvironment {
    const env = process.env

    // 检测 GitHub Actions
    if (env.GITHUB_ACTIONS === 'true') {
      return this.detectGitHubActions(env)
    }

    // 检测 GitLab CI
    if (env.GITLAB_CI === 'true') {
      return this.detectGitLabCI(env)
    }

    // 检测 Jenkins
    if (env.JENKINS_URL) {
      return this.detectJenkins(env)
    }

    // 检测 Azure Pipelines
    if (env.TF_BUILD === 'True') {
      return this.detectAzurePipelines(env)
    }

    // 检测 CircleCI
    if (env.CIRCLECI === 'true') {
      return this.detectCircleCI(env)
    }

    // 检测 Travis CI
    if (env.TRAVIS === 'true') {
      return this.detectTravisCI(env)
    }

    // 通用 CI 检测
    if (env.CI === 'true' || env.CI === '1') {
      return {
        isCI: true,
        provider: 'unknown',
      }
    }

    // 不在 CI 环境中
    return {
      isCI: false,
      provider: 'unknown',
    }
  }

  /**
   * 检测 GitHub Actions 环境
   */
  private detectGitHubActions(env: NodeJS.ProcessEnv): CIEnvironment {
    return {
      isCI: true,
      provider: 'github',
      buildId: env.GITHUB_RUN_ID,
      buildNumber: env.GITHUB_RUN_NUMBER,
      branch: env.GITHUB_REF_NAME,
      commit: env.GITHUB_SHA,
      prNumber: env.GITHUB_EVENT_NAME === 'pull_request' ? this.extractPRNumber(env.GITHUB_REF) : undefined,
      repository: env.GITHUB_REPOSITORY,
      buildUrl: env.GITHUB_SERVER_URL && env.GITHUB_REPOSITORY && env.GITHUB_RUN_ID
        ? `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`
        : undefined,
      jobName: env.GITHUB_JOB,
    }
  }

  /**
   * 检测 GitLab CI 环境
   */
  private detectGitLabCI(env: NodeJS.ProcessEnv): CIEnvironment {
    return {
      isCI: true,
      provider: 'gitlab',
      buildId: env.CI_PIPELINE_ID,
      buildNumber: env.CI_PIPELINE_IID,
      branch: env.CI_COMMIT_REF_NAME,
      commit: env.CI_COMMIT_SHA,
      prNumber: env.CI_MERGE_REQUEST_IID,
      repository: env.CI_PROJECT_PATH,
      buildUrl: env.CI_PIPELINE_URL,
      jobName: env.CI_JOB_NAME,
    }
  }

  /**
   * 检测 Jenkins 环境
   */
  private detectJenkins(env: NodeJS.ProcessEnv): CIEnvironment {
    return {
      isCI: true,
      provider: 'jenkins',
      buildId: env.BUILD_ID,
      buildNumber: env.BUILD_NUMBER,
      branch: env.GIT_BRANCH || env.BRANCH_NAME,
      commit: env.GIT_COMMIT,
      repository: env.GIT_URL,
      buildUrl: env.BUILD_URL,
      jobName: env.JOB_NAME,
    }
  }

  /**
   * 检测 Azure Pipelines 环境
   */
  private detectAzurePipelines(env: NodeJS.ProcessEnv): CIEnvironment {
    return {
      isCI: true,
      provider: 'azure',
      buildId: env.BUILD_BUILDID,
      buildNumber: env.BUILD_BUILDNUMBER,
      branch: env.BUILD_SOURCEBRANCHNAME,
      commit: env.BUILD_SOURCEVERSION,
      prNumber: env.SYSTEM_PULLREQUEST_PULLREQUESTNUMBER,
      repository: env.BUILD_REPOSITORY_NAME,
      buildUrl: env.SYSTEM_TEAMFOUNDATIONCOLLECTIONURI && env.SYSTEM_TEAMPROJECT && env.BUILD_BUILDID
        ? `${env.SYSTEM_TEAMFOUNDATIONCOLLECTIONURI}${env.SYSTEM_TEAMPROJECT}/_build/results?buildId=${env.BUILD_BUILDID}`
        : undefined,
      jobName: env.AGENT_JOBNAME,
    }
  }

  /**
   * 检测 CircleCI 环境
   */
  private detectCircleCI(env: NodeJS.ProcessEnv): CIEnvironment {
    return {
      isCI: true,
      provider: 'unknown',
      buildId: env.CIRCLE_BUILD_NUM,
      buildNumber: env.CIRCLE_BUILD_NUM,
      branch: env.CIRCLE_BRANCH,
      commit: env.CIRCLE_SHA1,
      prNumber: env.CIRCLE_PR_NUMBER,
      repository: env.CIRCLE_PROJECT_REPONAME,
      buildUrl: env.CIRCLE_BUILD_URL,
      jobName: env.CIRCLE_JOB,
    }
  }

  /**
   * 检测 Travis CI 环境
   */
  private detectTravisCI(env: NodeJS.ProcessEnv): CIEnvironment {
    return {
      isCI: true,
      provider: 'unknown',
      buildId: env.TRAVIS_BUILD_ID,
      buildNumber: env.TRAVIS_BUILD_NUMBER,
      branch: env.TRAVIS_BRANCH,
      commit: env.TRAVIS_COMMIT,
      prNumber: env.TRAVIS_PULL_REQUEST !== 'false' ? env.TRAVIS_PULL_REQUEST : undefined,
      repository: env.TRAVIS_REPO_SLUG,
      buildUrl: env.TRAVIS_BUILD_WEB_URL,
      jobName: env.TRAVIS_JOB_NAME,
    }
  }

  /**
   * 从 GitHub ref 中提取 PR 编号
   */
  private extractPRNumber(ref?: string): string | undefined {
    if (!ref) return undefined
    const match = ref.match(/refs\/pull\/(\d+)\//)
    return match ? match[1] : undefined
  }

  /**
   * 检查是否在 CI 环境中
   */
  isCI(): boolean {
    return this.detect().isCI
  }

  /**
   * 获取 CI 提供商
   */
  getProvider(): CIProvider {
    return this.detect().provider
  }
}

/**
 * 从环境变量加载配置
 */
export function loadConfigFromEnv(): Partial<{
  ci: {
    enabled: boolean
    failOnRegression: boolean
    regressionThreshold: number
    annotations: boolean
  }
  parallel: {
    enabled: boolean
    maxWorkers: number
  }
  outputDir: string
  historyDir: string
}> {
  const env = process.env
  const config: any = {}

  // CI 配置
  if (env.BENCHMARK_CI_ENABLED !== undefined) {
    config.ci = config.ci || {}
    config.ci.enabled = env.BENCHMARK_CI_ENABLED === 'true' || env.BENCHMARK_CI_ENABLED === '1'
  }

  if (env.BENCHMARK_CI_FAIL_ON_REGRESSION !== undefined) {
    config.ci = config.ci || {}
    config.ci.failOnRegression = env.BENCHMARK_CI_FAIL_ON_REGRESSION === 'true' || env.BENCHMARK_CI_FAIL_ON_REGRESSION === '1'
  }

  if (env.BENCHMARK_CI_REGRESSION_THRESHOLD !== undefined) {
    config.ci = config.ci || {}
    const threshold = parseFloat(env.BENCHMARK_CI_REGRESSION_THRESHOLD)
    if (!isNaN(threshold)) {
      config.ci.regressionThreshold = threshold
    }
  }

  if (env.BENCHMARK_CI_ANNOTATIONS !== undefined) {
    config.ci = config.ci || {}
    config.ci.annotations = env.BENCHMARK_CI_ANNOTATIONS === 'true' || env.BENCHMARK_CI_ANNOTATIONS === '1'
  }

  // 并行配置
  if (env.BENCHMARK_PARALLEL_ENABLED !== undefined) {
    config.parallel = config.parallel || {}
    config.parallel.enabled = env.BENCHMARK_PARALLEL_ENABLED === 'true' || env.BENCHMARK_PARALLEL_ENABLED === '1'
  }

  if (env.BENCHMARK_PARALLEL_MAX_WORKERS !== undefined) {
    config.parallel = config.parallel || {}
    const maxWorkers = parseInt(env.BENCHMARK_PARALLEL_MAX_WORKERS, 10)
    if (!isNaN(maxWorkers) && maxWorkers > 0) {
      config.parallel.maxWorkers = maxWorkers
    }
  }

  // 输出目录
  if (env.BENCHMARK_OUTPUT_DIR) {
    config.outputDir = env.BENCHMARK_OUTPUT_DIR
  }

  // 历史目录
  if (env.BENCHMARK_HISTORY_DIR) {
    config.historyDir = env.BENCHMARK_HISTORY_DIR
  }

  return config
}

/**
 * 创建 CI 环境检测器
 */
export function createCIEnvironmentDetector(): CIEnvironmentDetector {
  return new CIEnvironmentDetector()
}

/**
 * 获取当前 CI 环境信息
 */
export function getCIEnvironment(): CIEnvironment {
  const detector = new CIEnvironmentDetector()
  return detector.detect()
}

/**
 * 检查是否在 CI 环境中
 */
export function isCI(): boolean {
  const detector = new CIEnvironmentDetector()
  return detector.isCI()
}
