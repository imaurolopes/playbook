import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { ImplementationService } from './application/implementation-service'
import { TopicService } from './application/topic-service'
import { LocalStorageTopicRepository } from './infrastructure/local-storage-topic-repository'
import { sampleTopics } from './infrastructure/sample-topics'
import { App } from './presentation/App'
import './presentation/styles.css'

const repository = new LocalStorageTopicRepository(() => window.localStorage, sampleTopics)
const service = new TopicService(repository)
const implementationService = new ImplementationService(repository)

createRoot(document.getElementById('root')!).render(
  <StrictMode><BrowserRouter><App service={service} implementationService={implementationService} /></BrowserRouter></StrictMode>,
)
