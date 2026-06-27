import { Controller, Get, Param, NotFoundException, Inject } from "@nestjs/common";
import { SessionTracker } from "./session-tracker.interface";
import { SessionState } from "./session-state.interface";

@Controller("sessions")
export class SessionController {
  constructor(
    @Inject(SessionTracker)
    private readonly sessionTracker: SessionTracker,
  ) {}

  /**
   * Endpoint to retrieve all active/disconnected tracked sessions.
   * Route: GET /sessions
   */
  @Get()
  public getAllSessions(): SessionState[] {
    return this.sessionTracker.getAllSessions();
  }

  /**
   * Endpoint to retrieve metadata for a specific session by ID.
   * Route: GET /sessions/:id
   */
  @Get(":id")
  public getSession(@Param("id") id: string): SessionState {
    const session = this.sessionTracker.getSession(id);
    if (!session) {
      throw new NotFoundException(`Session with ID ${id} not found.`);
    }
    return session;
  }
}
