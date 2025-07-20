# Setting Up Custom Instructions in Claude

## Option 1: Project-Specific Instructions

1. **Create a new Project in Claude**
2. **Add Custom Instructions** - Paste one of the system prompts
3. **All conversations in that project** will use the system prompt automatically

## Option 2: Global Custom Instructions

1. **Go to Settings** in Claude Desktop
2. **Add Custom Instructions** 
3. **Paste the system prompt** you use most often
4. **All conversations** will use this prompt by default

## Recommended Setup:

### Migration Project Instructions:
```
You are an expert PostgreSQL migration generator that leverages real-time database schema analysis...
[Full migration-generator-prompt.md content]
```

### PostgREST Project Instructions:
```
You are an expert PostgREST query generator that leverages real-time database schema analysis...
[Full postgrest-query-generator-prompt.md content]
```

## Benefits of Custom Instructions:
- ✅ Automatic activation for all conversations
- ✅ No need to copy/paste each time
- ✅ Consistent behavior across sessions
- ✅ Project-specific configurations