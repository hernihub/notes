DROP USER IF EXISTS {APUSER};
DROP TABLE IF EXISTS AgentSecurityProfile;
DROP TABLE IF EXISTS AgentBusinessUnit;
DROP TABLE IF EXISTS Agent;
CREATE TABLE Agent
(
    Id varchar(45) PRIMARY KEY NOT NULL,
    UserName varchar(45),
    FirstName varchar(45),
    LastName varchar(45),
    RoutingProfileId varchar(45),
    ACWTimeout INT,
    AutoAcceptCall boolean,
    HierarchyGroupLevel1GroupName varchar(50),
    HierarchyGroupLevel2GroupName varchar(50),
    HierarchyGroupLevel3GroupName varchar(50),
    HierarchyGroupLevel4GroupName varchar(50)
);
CREATE TABLE SecurityProfile
(
    Id varchar(45) PRIMARY KEY NOT NULL,
    Hierarchy INT NOT NULL
);

CREATE TABLE AgentSecurityProfile
(
    AgentId varchar(45) references Agent (Id) NOT NULL ,
    SecurityProfileId varchar(45) references SecurityProfile (Id) NOT NULL,
    PRIMARY KEY (AgentId, SecurityProfileId)
);
CREATE TABLE AgentBusinessUnit
(
    AgentId varchar(45) references Agent (Id) NOT NULL ,
    BusinessUnitId integer NOT NULL
);

ALTER TABLE Role ADD COLUMN Hierarchy INT;

UPDATE Role SET Hierarchy=5 WHERE Name='Agent';
UPDATE Role SET Hierarchy=4 WHERE Name='Supervisor';
UPDATE Role SET Hierarchy=4 WHERE Name='OpsAnalyst';
UPDATE Role SET Hierarchy=4 WHERE Name='QualAnalyst';
UPDATE Role SET Hierarchy=3 WHERE Name='BusAdmin';
UPDATE Role SET Hierarchy=2 WHERE Name='TechAdminRO';
UPDATE Role SET Hierarchy=1 WHERE Name='TechAdmin';

ALTER TABLE Role ALTER COLUMN Hierarchy SET NOT NULL;

CREATE USER {APUSER} WITH PASSWORD '{APPWD}';
GRANT SELECT,UPDATE,INSERT ON AgentSecurityProfile,AgentBusinessUnit,Agent TO {APUSER};
GRANT SELECT ON BusinessUnit TO {APUSER};
GRANT DELETE ON AgentSecurityProfile,AgentBusinessUnit TO {APUSER};
GRANT ALL ON Agent,SecurityProfile,AgentSecurityProfile,AgentBusinessUnit TO {ADMINUSER};
